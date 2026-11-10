import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PaymentNotImplemented } from "@s4n/plugin-sdk";
import type { RuntimeEnv } from "./env.js";
import { originAllowlist, originGuard } from "./auth/origin.js";
import { rateLimit } from "./auth/rate-limit.js";
import { handlePaymentCallback } from "./payments/callback.js";
import type { Ledger } from "./payments/ledger.js";
import { planDonation, validateDonationRequest } from "./payments/plan.js";
import type { LoadedPlugin, PaymentRegistry } from "./plugins/catalog.js";
import { decryptPluginSecrets } from "./plugins/secrets.js";
import {
  redactSettings,
  saveSettings,
  SettingsValidationError,
  type SecretStore,
} from "./plugins/settings.js";
import type { CoreBus } from "./realtime/bus.js";

export interface AppDeps {
  envName: RuntimeEnv;
  dashboardOrigin: string;
  masterKey: Buffer;
  catalog: readonly LoadedPlugin[];
  providers: PaymentRegistry;
  secrets: SecretStore;
  ledger: Ledger;
  bus: CoreBus;
  pingDatabase: () => Promise<"up" | "down" | "unconfigured">;
  callbackRateLimit?: { windowMs: number; max: number };
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const allowedOrigins = originAllowlist(deps.dashboardOrigin);
  const callbackLimit = deps.callbackRateLimit ?? { windowMs: 60_000, max: 60 };

  app.use("*", async (c, next) => {
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
    c.header("x-frame-options", "DENY");
    await next();
  });

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
      allowHeaders: ["content-type"],
      credentials: true,
    }),
  );

  app.get("/api/health", async (c) => {
    const database = await deps.pingDatabase();
    return c.json({
      service: "s4n-api",
      status: "ok",
      database,
      realtime: "stub",
      payments: deps.providers.ids(),
    });
  });

  app.get("/api/plugins", (c) => {
    return c.json({
      plugins: deps.catalog.map((plugin) => ({
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description ?? null,
        kind: plugin.manifest.kind,
        permissions: plugin.manifest.permissions,
        official: true,
        activation: "not_implemented",
        settingsFields: describeFields(plugin),
      })),
    });
  });

  app.get("/api/plugins/:id/settings", async (c) => {
    c.header("cache-control", "no-store");
    const plugin = findPlugin(deps.catalog, c.req.param("id"));
    if (plugin === undefined) return c.json({ error: "unknown_plugin" }, 404);
    try {
      const [publicSettings, configured] = await Promise.all([
        deps.secrets.readPublicSettings(plugin.manifest.id),
        deps.secrets.readConfiguredKeys(plugin.manifest.id),
      ]);
      return c.json({
        pluginId: plugin.manifest.id,
        persistence: deps.secrets.persistence,
        fields: redactSettings(plugin.manifest.settingsSchema, publicSettings, configured),
      });
    } catch {
      return c.json(
        {
          pluginId: plugin.manifest.id,
          persistence: "unavailable",
          fields: redactSettings(plugin.manifest.settingsSchema, {}, []),
        },
        503,
      );
    }
  });

  app.put(
    "/api/plugins/:id/settings",
    originGuard(allowedOrigins),
    rateLimit({
      windowMs: 60_000,
      max: 30,
      key: (c) => `settings:${c.req.param("id")}:${c.req.header("x-forwarded-for") ?? "local"}`,
    }),
    async (c) => {
      c.header("cache-control", "no-store");
      const plugin = findPlugin(deps.catalog, c.req.param("id"));
      if (plugin === undefined) return c.json({ error: "unknown_plugin" }, 404);
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: "invalid_json" }, 422);
      if (!isRecord(body.value) || !isRecord(body.value.values)) {
        return c.json({ error: "invalid_settings" }, 422);
      }
      try {
        const fields = await saveSettings({
          manifest: plugin.manifest,
          store: deps.secrets,
          masterKey: deps.masterKey,
          values: body.value.values,
        });
        return c.json({ pluginId: plugin.manifest.id, fields });
      } catch (error) {
        if (error instanceof SettingsValidationError) {
          return c.json({ error: "invalid_settings", issues: error.issues }, 422);
        }
        return c.json({ error: "settings_unavailable" }, 503);
      }
    },
  );

  app.post(
    "/api/donations",
    originGuard(allowedOrigins),
    rateLimit({
      windowMs: 60_000,
      max: 20,
      key: (c) => `donate:${c.req.header("x-forwarded-for") ?? "local"}`,
    }),
    async (c) => {
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: "invalid_json" }, 422);
      const parsed = validateDonationRequest(body.value);
      if (!parsed.ok) return c.json({ error: "invalid_donation", issues: parsed.issues }, 422);

      const provider = deps.providers.get(parsed.value.pluginId);
      if (provider === undefined) return c.json({ error: "unknown_provider" }, 404);

      const planned = planDonation(randomUUID(), parsed.value);
      let secrets: Record<string, string> = {};
      let secretsFailed = false;
      try {
        secrets = await decryptPluginSecrets(provider.pluginId, deps.secrets, deps.masterKey);
      } catch {
        secretsFailed = true;
      }

      try {
        await provider.createPayment(
          {
            orderId: planned.id,
            amountMinor: planned.amountMinor,
            currency: planned.currency,
            callbackUrl: callbackUrl(c.req.url, provider.pluginId),
            returnUrl: `${deps.dashboardOrigin}/donate`,
          },
          secrets,
        );
      } catch (error) {
        if (error instanceof PaymentNotImplemented) {
          return c.json({ error: "payment_not_implemented", pluginId: provider.pluginId }, 501);
        }
        if (secretsFailed) return c.json({ error: "secrets_unavailable" }, 503);
        return c.json({ error: "donation_failed" }, 500);
      }

      if (secretsFailed) return c.json({ error: "secrets_unavailable" }, 503);
      // Official providers throw before this. A resolved createPayment is still
      // not a finished checkout: the skeleton does not persist the order.
      return c.json({ error: "payment_not_implemented", pluginId: provider.pluginId }, 501);
    },
  );

  app.post(
    "/api/payments/:pluginId/callback",
    rateLimit({
      windowMs: callbackLimit.windowMs,
      max: callbackLimit.max,
      key: (c) =>
        `callback:${c.req.param("pluginId")}:${c.req.header("x-forwarded-for") ?? "local"}`,
    }),
    async (c) => {
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const result = await handlePaymentCallback({
        pluginId: c.req.param("pluginId"),
        rawBody: await c.req.text(),
        headers,
        catalog: deps.catalog,
        providers: deps.providers,
        secrets: deps.secrets,
        ledger: deps.ledger,
        bus: deps.bus,
        masterKey: deps.masterKey,
      });
      return c.json(result.body, result.status as 200);
    },
  );

  return app;
}

function describeFields(plugin: LoadedPlugin) {
  const required = new Set(plugin.manifest.settingsSchema.required ?? []);
  return Object.entries(plugin.manifest.settingsSchema.properties).map(([key, field]) => ({
    key,
    title: field.title ?? null,
    type: field.type,
    secret: field["x-s4n-secret"] === true,
    required: required.has(key),
    enum: field.enum ?? null,
  }));
}

function findPlugin(catalog: readonly LoadedPlugin[], id: string): LoadedPlugin | undefined {
  return catalog.find((plugin) => plugin.manifest.id === id);
}

function callbackUrl(requestUrl: string, pluginId: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/payments/${pluginId}/callback`;
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
