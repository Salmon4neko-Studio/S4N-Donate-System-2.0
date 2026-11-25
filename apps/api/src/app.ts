import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { asUntrustedText } from "s4n-donate-system-2.0-events";
import type { RuntimeEnv } from "./env.js";
import { originAllowlist, originGuard } from "./auth/origin.js";
import { rateLimit } from "./auth/rate-limit.js";
import { registerAuthRoutes } from "./auth/routes.js";
import type { AuthService } from "./auth/service.js";
import { requireSession, sessionCookieSecure, type SessionEnv } from "./auth/session.js";
import { clientKey, isRecord, readJson } from "./http.js";
import { handlePaymentCallback, settlePaymentNotification } from "./payments/callback.js";
import { createDonationCheckout } from "./payments/checkout.js";
import type { DonationState, Ledger } from "./payments/ledger.js";
import { settlePaymentInfo } from "./payments/payment-info.js";
import { validateDonationRequest } from "./payments/plan.js";
import { paymentMethodReady } from "./payments/readiness.js";
import { reconcileDonation } from "./payments/reconcile.js";
import { isTradeNo } from "./payments/trade-no.js";
import { hasPluginSettingsNav, isSecretField } from "s4n-donate-system-2.0-plugin-sdk";
import type { LoadedPlugin, PaymentRegistry } from "./plugins/catalog.js";
import type { InstallationStore } from "./plugins/installations.js";
import { MarketplaceError, type MarketplaceService } from "./plugins/marketplace/service.js";
import { registerMarketplaceRoutes } from "./plugins/marketplace/routes.js";
import {
  redactSettings,
  saveSettings,
  SettingsValidationError,
  splitRedactedFields,
  type SecretStore,
} from "./plugins/settings.js";
import type { CoreBus } from "./realtime/bus.js";
import { toEventLogEntry } from "./realtime/summary.js";
import { overlayPageUrl } from "./realtime/overlay-url.js";
import {
  canvasPlugins,
  mergeLayout,
  readLayoutUpdate,
  viewLayout,
  type OverlayLayoutStore,
} from "./realtime/overlay-layout.js";
import { previewChatMessage } from "s4n-donate-system-2.0-plugin-chat-overlay";
import { registerAlertSoundRoutes } from "./alerts/routes.js";
import type { AlertSoundStore } from "./alerts/sound.js";

export interface AppDeps {
  envName: RuntimeEnv;
  dashboardOrigin: string;
  overlayOrigin: string;
  publicBaseUrl: string;
  donationMin: number;
  donationMax: number;
  masterKey: Buffer;
  catalog: readonly LoadedPlugin[];
  providers: PaymentRegistry;
  secrets: SecretStore;
  installations: InstallationStore;
  marketplace: MarketplaceService;
  ledger: Ledger;
  bus: CoreBus;
  auth: AuthService;
  layouts: OverlayLayoutStore;
  /** `postgres` once the API is writing the shared event log. Tests stay on `memory`. */
  eventLog?: "memory" | "postgres";
  eventRetentionDays?: number;
  eventChatRetentionHours?: number;
  pingDatabase: () => Promise<"up" | "down" | "unconfigured">;
  callbackRateLimit?: { windowMs: number; max: number };
  loginRateLimit?: { windowMs: number; max: number };
  /** Last X-Forwarded-For hop, and the public scheme on the request URL. */
  trustProxy?: boolean;
  /** Fired after a plugin is enabled or its settings are saved. */
  onPluginsChanged?: (pluginId?: string) => void;
  alertSounds?: AlertSoundStore;
}

export function createApp(deps: AppDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  const dashboardOrigins = originAllowlist(deps.dashboardOrigin);
  const readOrigins = originAllowlist(deps.dashboardOrigin, deps.overlayOrigin);
  const callbackLimit = deps.callbackRateLimit ?? { windowMs: 60_000, max: 60 };
  const secureCookie = sessionCookieSecure(deps.envName);
  const session = requireSession(deps.auth, {
    secure: secureCookie,
    rotateAfterMs: deps.auth.rotateAfterMs,
  });
  const guard = originGuard(dashboardOrigins);
  const trustProxy = deps.trustProxy === true;
  const caller = (header: string | undefined) => clientKey(header, trustProxy);

  app.use("*", async (c, next) => {
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
    c.header("x-frame-options", "DENY");
    await next();
  });

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (readOrigins.has(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
      allowHeaders: ["content-type"],
      credentials: true,
    }),
  );

  registerAuthRoutes(app, {
    auth: deps.auth,
    allowedOrigins: dashboardOrigins,
    secureCookie,
    trustProxy,
    ...(deps.loginRateLimit ? { loginRateLimit: deps.loginRateLimit } : {}),
  });

  app.get("/api/health", async (c) => {
    const database = await deps.pingDatabase();
    return c.json({
      service: "s4n-api",
      status: "ok",
      database,
      realtime: "websocket",
      eventLog: deps.eventLog ?? "memory",
      payments: deps.providers.ids(),
    });
  });

  app.get("/api/events", session, async (c) => {
    const limit = readLimit(c.req.query("limit"));
    try {
      const [head, events] = await Promise.all([deps.bus.head(), deps.bus.readRecent(limit)]);
      return c.json({
        head: head.toString(),
        retention: {
          defaultDays: deps.eventRetentionDays ?? 7,
          chatHours: deps.eventChatRetentionHours ?? 24,
        },
        eventLog: deps.eventLog ?? "memory",
        events: events.map(toEventLogEntry),
      });
    } catch {
      return c.json({ error: "event_log_unavailable" }, 503);
    }
  });

  app.get("/api/plugins", session, async (c) => {
    await deps.marketplace.ready();
    if (!deps.marketplace.isTrusted()) {
      let enabled = new Set<string>();
      try {
        enabled = new Set(await deps.installations.enabledIds());
      } catch {
        return c.json({ error: "plugins_unavailable" }, 503);
      }
      return c.json({
        plugins: deps.catalog.map((plugin) => ({
          id: plugin.manifest.id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          description: plugin.manifest.description ?? null,
          kind: plugin.manifest.kind,
          permissions: plugin.manifest.permissions,
          official: true,
          enabled: enabled.has(plugin.manifest.id),
          settingsFields: describeFields(plugin),
          settingsNav: hasPluginSettingsNav(plugin.manifest),
          category: null,
          author: null,
          latestVersion: plugin.manifest.version,
          updateAvailable: false,
          pinned: false,
          addedPermissions: [],
          previousVersion: null,
          source: "official",
        })),
      });
    }
    let listings;
    try {
      listings = await deps.marketplace.listings();
    } catch {
      return c.json({ error: "plugins_unavailable" }, 503);
    }
    const installed = new Map(listings.filter((item) => item.installed).map((item) => [item.id, item]));
    const fromCatalog = deps.catalog.flatMap((plugin) => {
      const listing = installed.get(plugin.manifest.id);
      if (listing === undefined) return [];
      return [pluginSummary(plugin, listing)];
    });
    const catalogIds = new Set(deps.catalog.map((plugin) => plugin.manifest.id));
    const extras = listings
      .filter((listing) => listing.installed && !catalogIds.has(listing.id))
      .map((listing) => ({
        id: listing.id,
        name: listing.name,
        version: listing.installedVersion ?? listing.version,
        description: listing.description,
        kind: listing.kind,
        permissions: listing.permissions,
        official: listing.official,
        enabled: listing.enabled,
        settingsFields: [],
        settingsNav: listing.kind.includes("overlay"),
        category: listing.category,
        author: listing.author,
        latestVersion: listing.version,
        updateAvailable: listing.updateAvailable,
        pinned: listing.pinned,
        addedPermissions: listing.addedPermissions,
        previousVersion: listing.previousVersion,
        source: listing.source,
      }));
    return c.json({ plugins: [...fromCatalog, ...extras] });
  });

  registerMarketplaceRoutes(app, {
    marketplace: deps.marketplace,
    session,
    guard,
    catalog: deps.catalog,
    installations: deps.installations,
    trustProxy,
    ...(deps.onPluginsChanged !== undefined ? { onPluginsChanged: deps.onPluginsChanged } : {}),
  });

  app.get("/api/plugins/:id/settings", session, async (c) => {
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
        ...splitRedactedFields(redactSettings(plugin.manifest.settingsSchema, publicSettings, configured)),
      });
    } catch {
      return c.json(
        {
          pluginId: plugin.manifest.id,
          persistence: "unavailable",
          ...splitRedactedFields(redactSettings(plugin.manifest.settingsSchema, {}, [])),
        },
        503,
      );
    }
  });

  app.put(
    "/api/plugins/:id/settings",
    session,
    guard,
    rateLimit({
      windowMs: 60_000,
      max: 30,
      key: (c) => `settings:${c.req.param("id")}:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      const plugin = findPlugin(deps.catalog, c.req.param("id"));
      if (plugin === undefined) return c.json({ error: "unknown_plugin" }, 404);
      await deps.marketplace.ready();
      if (deps.marketplace.isTrusted()) {
        try {
          const listing = await deps.marketplace.listing(plugin.manifest.id);
          if (!listing.installed) return c.json({ error: "not_installed" }, 409);
        } catch (error) {
          if (error instanceof MarketplaceError && error.code === "unknown_plugin") {
            return c.json({ error: "unknown_plugin" }, 404);
          }
          if (error instanceof MarketplaceError) return c.json({ error: error.code }, 409);
          return c.json({ error: "plugins_unavailable" }, 503);
        }
      }
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
        deps.onPluginsChanged?.(plugin.manifest.id);
        return c.json({ pluginId: plugin.manifest.id, ...splitRedactedFields(fields) });
      } catch (error) {
        if (error instanceof SettingsValidationError) {
          return c.json({ error: "invalid_settings", issues: error.issues }, 422);
        }
        return c.json({ error: "settings_unavailable" }, 503);
      }
    },
  );

  const alerts = findPlugin(deps.catalog, "official.alerts");
  registerAlertSoundRoutes(app, {
    ...(deps.alertSounds !== undefined ? { alertSounds: deps.alertSounds } : {}),
    secrets: deps.secrets,
    marketplace: deps.marketplace,
    session,
    guard,
    overlayOperatorId: (token) => deps.auth.overlayOperatorId(token),
    version: alerts?.manifest.version ?? "0.3.0",
  });

  app.get("/api/donations", session, async (c) => {
    const status = readStatusFilter(c.req.query("status"));
    if (status === "invalid") return c.json({ error: "invalid_status" }, 422);
    try {
      const donations = await deps.ledger.listRecent(50, status);
      return c.json({ donations });
    } catch {
      return c.json({ error: "ledger_unavailable" }, 503);
    }
  });

  app.post("/api/donations/test", session, guard, async (c) => {
    const body = await readJson(c.req.raw);
    if (!body.ok) return c.json({ error: "invalid_json" }, 422);
    const parsed = validateDonationRequest(testDonationBody(body.value));
    if (!parsed.ok) return c.json({ error: "invalid_donation", issues: parsed.issues }, 422);
    try {
      const event = await deps.bus.publish("s4n.donation.test", {
        donationId: `test_${randomUUID()}`,
        providerId: "s4n.test",
        amountMinor: parsed.value.amountMinor,
        currency: "TWD",
        donorName: asUntrustedText(parsed.value.donorName),
        message: asUntrustedText(parsed.value.message),
        test: true,
      });
      return c.json({ test: true, eventId: event.id });
    } catch {
      return c.json({ error: "event_log_unavailable" }, 503);
    }
  });

  app.get("/api/donate/options", async (c) => {
    c.header("cache-control", "no-store");
    try {
      const methods = [];
      for (const plugin of deps.catalog) {
        if (!plugin.manifest.kind.includes("payment")) continue;
        if (!(await paymentMethodReady(plugin, deps.installations, deps.secrets))) continue;
        methods.push({ id: plugin.manifest.id, name: plugin.manifest.name });
      }
      return c.json({
        currency: "TWD",
        minAmount: deps.donationMin,
        maxAmount: deps.donationMax,
        methods,
      });
    } catch {
      return c.json({ error: "provider_unavailable" }, 503);
    }
  });

  app.get(
    "/api/donations/:id/status",
    rateLimit({
      windowMs: 60_000,
      max: 60,
      key: (c) => `status:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
    c.header("cache-control", "no-store");
    const id = c.req.param("id");
    if (!isTradeNo(id)) return c.json({ error: "unknown_order" }, 404);
    try {
      const order = await deps.ledger.getById(id);
      if (order === null) return c.json({ error: "unknown_order" }, 404);
      return c.json({
        status: order.status,
        amountMinor: order.amountMinor,
        currency: order.currency,
        providerId: order.providerId,
      });
    } catch {
      return c.json({ error: "ledger_unavailable" }, 503);
    }
  },
  );

  app.post(
    "/api/donations",
    guard,
    rateLimit({
      windowMs: 60_000,
      max: 20,
      key: (c) => `donate:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      c.header("cache-control", "no-store");
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: "invalid_json" }, 422);
      const result = await createDonationCheckout({
        body: body.value,
        catalog: deps.catalog,
        providers: deps.providers,
        secrets: deps.secrets,
        installations: deps.installations,
        ledger: deps.ledger,
        bus: deps.bus,
        masterKey: deps.masterKey,
        limits: { min: deps.donationMin, max: deps.donationMax },
        publicBaseUrl: deps.publicBaseUrl,
        dashboardOrigin: deps.dashboardOrigin,
      });
      return c.json(result.body, result.status as 201);
    },
  );

  app.get("/api/overlay", session, async (c) => {
    try {
      const operatorId = c.get("operatorId");
      const [token, layout] = await Promise.all([
        deps.auth.readOverlayToken(operatorId),
        readOperatorLayout(deps, operatorId),
      ]);
      return c.json(overlayLinks(deps.overlayOrigin, token, layout));
    } catch {
      return c.json({ error: "overlay_unavailable" }, 503);
    }
  });

  app.put("/api/overlay/layout", session, guard, async (c) => {
    const body = await readJson(c.req.raw);
    if (!body.ok) return c.json({ error: "invalid_json" }, 422);
    const allowed = new Set(canvasPlugins(deps.catalog).map((plugin) => plugin.id));
    const update = readLayoutUpdate(body.value, allowed);
    if (update === null) return c.json({ error: "invalid_layout" }, 422);
    const operatorId = c.get("operatorId");
    try {
      const previous = await deps.layouts.read(operatorId);
      await deps.layouts.write(operatorId, mergeLayout(previous, update, allowed));
      const [token, layout] = await Promise.all([
        deps.auth.readOverlayToken(operatorId),
        readOperatorLayout(deps, operatorId),
      ]);
      return c.json(overlayLinks(deps.overlayOrigin, token, layout));
    } catch {
      return c.json({ error: "overlay_unavailable" }, 503);
    }
  });

  app.get("/api/overlay/scene", async (c) => {
    c.header("cache-control", "no-store");
    const operatorId = await deps.auth.overlayOperatorId(c.req.query("token") ?? "");
    if (operatorId === null) return c.json({ error: "unauthorized" }, 401);
    try {
      const layout = await readOperatorLayout(deps, operatorId);
      return c.json({ canvas: layout.canvas, slots: layout.slots });
    } catch {
      return c.json({ error: "overlay_unavailable" }, 503);
    }
  });

  app.post("/api/overlay/token", session, guard, async (c) => {
    try {
      const operatorId = c.get("operatorId");
      const token = await deps.auth.issueOverlayToken(operatorId);
      const layout = await readOperatorLayout(deps, operatorId);
      return c.json(overlayLinks(deps.overlayOrigin, token, layout));
    } catch {
      return c.json({ error: "overlay_unavailable" }, 503);
    }
  });

  app.post("/api/chat/test", session, guard, async (c) => {
    const body = await readJson(c.req.raw);
    if (!body.ok) return c.json({ error: "invalid_json" }, 422);
    const parsed = readTestChat(body.value);
    if (parsed === null) return c.json({ error: "invalid_chat" }, 422);
    try {
      const event = await deps.bus.publish(
        "s4n.chat.message",
        previewChatMessage({
          displayName: parsed.displayName,
          text: parsed.text,
          now: new Date().toISOString(),
          messageId: `preview-${randomUUID()}`,
        }),
      );
      return c.json({ test: true, eventId: event.id });
    } catch {
      return c.json({ error: "event_log_unavailable" }, 503);
    }
  });

  app.get(
    "/api/donations/:id/instructions",
    rateLimit({
      windowMs: 60_000,
      max: 60,
      key: (c) => `instructions:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      c.header("cache-control", "no-store");
      const id = c.req.param("id");
      if (!isTradeNo(id)) return c.json({ error: "unknown_order" }, 404);
      try {
        const order = await deps.ledger.getById(id);
        if (order === null) return c.json({ error: "unknown_order" }, 404);
        return c.json({
          status: order.status,
          amountMinor: order.amountMinor,
          currency: order.currency,
          providerId: order.providerId,
          expiresAt: order.expiresAt,
          bankCode: order.bankCode,
          payCode: order.payCode,
          barcodes: order.barcodes,
        });
      } catch {
        return c.json({ error: "ledger_unavailable" }, 503);
      }
    },
  );

  app.post(
    "/api/payments/:pluginId/payment-info",
    rateLimit({
      windowMs: callbackLimit.windowMs,
      max: callbackLimit.max,
      key: (c) => `payment-info:${c.req.param("pluginId")}:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      const result = await settlePaymentInfo({
        pluginId: c.req.param("pluginId"),
        rawBody: await c.req.text(),
        headers: headerRecord(c.req.raw.headers),
        catalog: deps.catalog,
        providers: deps.providers,
        secrets: deps.secrets,
        ledger: deps.ledger,
        bus: deps.bus,
        masterKey: deps.masterKey,
      });
      return new Response(result.http.body, {
        status: result.http.status,
        headers: { "content-type": result.http.contentType },
      });
    },
  );

  app.post(
    "/api/payments/:pluginId/payment-redirect",
    rateLimit({
      windowMs: callbackLimit.windowMs,
      max: callbackLimit.max,
      key: (c) => `payment-redirect:${c.req.param("pluginId")}:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      const settled = await settlePaymentInfo({
        pluginId: c.req.param("pluginId"),
        rawBody: await c.req.text(),
        headers: headerRecord(c.req.raw.headers),
        catalog: deps.catalog,
        providers: deps.providers,
        secrets: deps.secrets,
        ledger: deps.ledger,
        bus: deps.bus,
        masterKey: deps.masterKey,
      });
      if (settled.http.status >= 500 || settled.orderId === null || !isTradeNo(settled.orderId)) {
        return new Response(settled.http.body, {
          status: settled.http.status,
          headers: { "content-type": settled.http.contentType },
        });
      }
      const target = new URL("/donate/pay", deps.dashboardOrigin);
      target.searchParams.set("order", settled.orderId);
      return c.redirect(target.toString(), 303);
    },
  );

  app.post(
    "/api/payments/:pluginId/callback",
    rateLimit({
      windowMs: callbackLimit.windowMs,
      max: callbackLimit.max,
      key: (c) =>
        `callback:${c.req.param("pluginId")}:${caller(c.req.header("x-forwarded-for"))}`,
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
      return new Response(result.body, {
        status: result.status,
        headers: { "content-type": result.contentType },
      });
    },
  );

  app.post(
    "/api/payments/:pluginId/return",
    rateLimit({
      windowMs: callbackLimit.windowMs,
      max: callbackLimit.max,
      key: (c) => `return:${c.req.param("pluginId")}:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const settled = await settlePaymentNotification({
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
      const target = new URL("/donate/result", deps.dashboardOrigin);
      if (settled.orderId !== null && isTradeNo(settled.orderId)) {
        target.searchParams.set("order", settled.orderId);
      }
      return c.redirect(target.toString(), 303);
    },
  );

  app.post(
    "/api/payments/:pluginId/reconcile",
    session,
    guard,
    rateLimit({
      windowMs: 60_000,
      max: 10,
      key: (c) => `reconcile:${c.req.param("pluginId")}:${caller(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      const body = await readJson(c.req.raw);
      if (!body.ok || !isRecord(body.value) || typeof body.value.orderId !== "string") {
        return c.json({ error: "invalid_order" }, 422);
      }
      const result = await reconcileDonation({
        pluginId: c.req.param("pluginId"),
        orderId: body.value.orderId,
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

const DONATION_STATES = new Set<DonationState>(["created", "awaiting", "succeeded", "expired", "failed", "review"]);

function readStatusFilter(value: string | undefined): DonationState | undefined | "invalid" {
  if (value === undefined || value === "") return undefined;
  return DONATION_STATES.has(value as DonationState) ? (value as DonationState) : "invalid";
}

function headerRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function readLimit(value: string | undefined): number {
  if (value === undefined || value === "") return 30;
  if (!/^[1-9][0-9]*$/.test(value)) return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 30;
  return Math.min(parsed, 100);
}

function testDonationBody(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    pluginId: "s4n.test",
    currency: "TWD",
    amountMinor: value.amountMinor,
    donorName: value.donorName,
    message: value.message,
  };
}

function overlayLinks(
  origin: string,
  token: string | null,
  layout: Awaited<ReturnType<typeof readOperatorLayout>>,
) {
  return {
    configured: token !== null,
    url: token === null ? null : overlayPageUrl(origin, token),
    canvas: layout.canvas,
    slots: layout.slots,
  };
}

async function readOperatorLayout(deps: AppDeps, operatorId: string) {
  const [stored, enabled] = await Promise.all([
    deps.layouts.read(operatorId),
    deps.installations.enabledIds(),
  ]);
  return viewLayout(stored, canvasPlugins(deps.catalog), enabled);
}

function readTestChat(value: unknown): { displayName: string; text: string } | null {
  if (!isRecord(value)) return null;
  const displayName = value.displayName;
  const text = value.text;
  if (typeof displayName !== "string" || typeof text !== "string") return null;
  if (displayName.length > 40 || text.length > 180) return null;
  return { displayName, text };
}

function pluginSummary(
  plugin: LoadedPlugin,
  listing: {
    installedVersion: string | null;
    version: string;
    official: boolean;
    enabled: boolean;
    category: string;
    author: string;
    updateAvailable: boolean;
    pinned: boolean;
    addedPermissions: string[];
    previousVersion: string | null;
    source: string;
  },
) {
  return {
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: listing.installedVersion ?? plugin.manifest.version,
    description: plugin.manifest.description ?? null,
    kind: plugin.manifest.kind,
    permissions: plugin.manifest.permissions,
    official: listing.official,
    enabled: listing.enabled,
    settingsFields: describeFields(plugin),
    settingsNav: hasPluginSettingsNav(plugin.manifest),
    category: listing.category,
    author: listing.author,
    latestVersion: listing.version,
    updateAvailable: listing.updateAvailable,
    pinned: listing.pinned,
    addedPermissions: listing.addedPermissions,
    previousVersion: listing.previousVersion,
    source: listing.source,
  };
}

function describeFields(plugin: LoadedPlugin) {
  const required = new Set(plugin.manifest.settingsSchema.required ?? []);
  return Object.entries(plugin.manifest.settingsSchema.properties).map(([key, field]) => ({
    key,
    title: field.title ?? null,
    description: field.description ?? null,
    type: field.type,
    secret: isSecretField(field),
    required: required.has(key),
    enum: field.enum ?? null,
    minimum: field.minimum ?? null,
    maximum: field.maximum ?? null,
    multiline: field["x-s4n-multiline"] === true,
    color: field["x-s4n-color"] === true,
    datetime: field["x-s4n-datetime"] === true,
    maxLength: field.maxLength ?? null,
    default: field.default ?? null,
  }));
}

function findPlugin(catalog: readonly LoadedPlugin[], id: string): LoadedPlugin | undefined {
  return catalog.find((plugin) => plugin.manifest.id === id);
}

