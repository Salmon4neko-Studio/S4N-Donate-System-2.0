import type { MiddlewareHandler } from "hono";
import { PERMISSIONS } from "s4n-donate-system-2.0-plugin-sdk";
import { InstallationRejected } from "../installations.js";
import type { InstallationStore } from "../installations.js";
import type { LoadedPlugin } from "../catalog.js";
import { MarketplaceError, type MarketplaceService } from "./service.js";
import type { SessionEnv } from "../../auth/session.js";
import type { Hono } from "hono";
import { clientKey, isRecord, readJson } from "../../http.js";
import { rateLimit } from "../../auth/rate-limit.js";

const KNOWN = new Set<string>(PERMISSIONS);

export function registerMarketplaceRoutes(
  app: Hono<SessionEnv>,
  deps: {
    marketplace: MarketplaceService;
    session: MiddlewareHandler<SessionEnv>;
    guard: MiddlewareHandler<SessionEnv>;
    catalog: readonly LoadedPlugin[];
    installations: InstallationStore;
    trustProxy?: boolean;
    onPluginsChanged?: () => void;
  },
): void {
  const session = deps.session;
  const guard = deps.guard;
  const limited = rateLimit({
    windowMs: 60_000,
    max: 30,
    key: (c) => `marketplace:${clientKey(c.req.header("x-forwarded-for"), deps.trustProxy === true)}`,
  });

  app.get("/api/marketplace", session, async (c) => {
    try {
      const plugins = await deps.marketplace.listings();
      return c.json({
        checkedAt: deps.marketplace.lastCheckedAt(),
        verified: true,
        plugins,
      });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/api/marketplace/:id", session, async (c) => {
    try {
      const plugin = await deps.marketplace.listing(c.req.param("id"));
      return c.json({ plugin, checkedAt: deps.marketplace.lastCheckedAt(), verified: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/api/marketplace/check", session, guard, limited, async (c) => {
    const result = await deps.marketplace.check();
    if (!result.verified) return c.json({ error: "registry_untrusted", reason: deps.marketplace.failure() }, 503);
    return c.json(result);
  });

  app.post("/api/marketplace/:id/install", session, guard, limited, async (c) => {
    const accepted = await readPermissions(c.req.raw);
    if (accepted === null) return c.json({ error: "invalid_permissions" }, 422);
    try {
      const plugin = await deps.marketplace.install(c.req.param("id"), accepted);
      return c.json({ plugin }, 201);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/api/marketplace/:id/update", session, guard, limited, async (c) => {
    const accepted = await readPermissions(c.req.raw);
    if (accepted === null) return c.json({ error: "invalid_permissions" }, 422);
    try {
      const plugin = await deps.marketplace.update(c.req.param("id"), accepted);
      deps.onPluginsChanged?.();
      return c.json({ plugin });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/api/marketplace/:id/pin", session, guard, limited, async (c) => {
    const body = await readJson(c.req.raw);
    if (!body.ok || !isRecord(body.value) || typeof body.value.pinned !== "boolean") {
      return c.json({ error: "invalid_pin" }, 422);
    }
    try {
      const plugin = await deps.marketplace.setPinned(c.req.param("id"), body.value.pinned);
      return c.json({ plugin });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/api/marketplace/:id/uninstall", session, guard, limited, async (c) => {
    const body = await readJson(c.req.raw);
    if (!body.ok || !isRecord(body.value) || typeof body.value.keepData !== "boolean") {
      return c.json({ error: "invalid_uninstall" }, 422);
    }
    try {
      await deps.marketplace.uninstall(c.req.param("id"), body.value.keepData);
      deps.onPluginsChanged?.();
      return c.json({ pluginId: c.req.param("id"), keepData: body.value.keepData });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.put("/api/plugins/:id/enabled", session, guard, async (c) => {
    const plugin = deps.catalog.find((item) => item.manifest.id === c.req.param("id"));
    const body = await readJson(c.req.raw);
    if (!body.ok || !isRecord(body.value) || typeof body.value.enabled !== "boolean") {
      return c.json({ error: "invalid_enabled" }, 422);
    }
    await deps.marketplace.ready();
    if (deps.marketplace.isTrusted()) {
      if (plugin === undefined && body.value.enabled) {
        try {
          await deps.marketplace.listing(c.req.param("id"));
        } catch (error) {
          if (error instanceof MarketplaceError && error.code === "unknown_plugin") {
            return c.json({ error: "unknown_plugin" }, 404);
          }
        }
      }
      try {
        await deps.marketplace.setEnabled(c.req.param("id"), body.value.enabled);
        deps.onPluginsChanged?.();
        return c.json({ pluginId: c.req.param("id"), enabled: body.value.enabled });
      } catch (error) {
        if (error instanceof MarketplaceError && error.code === "unknown_plugin") {
          return c.json({ error: "unknown_plugin" }, 404);
        }
        if (error instanceof MarketplaceError && error.code === "not_installed") {
          return c.json({ error: "not_installed" }, 409);
        }
        if (error instanceof InstallationRejected) return c.json({ error: "not_installed" }, 409);
        return fail(c, error);
      }
    }
    if (plugin === undefined) return c.json({ error: "unknown_plugin" }, 404);
    try {
      await deps.installations.setEnabled(plugin.manifest.id, body.value.enabled, plugin.manifest.version);
    } catch (error) {
      if (error instanceof InstallationRejected) return c.json({ error: "not_installed" }, 409);
      return c.json({ error: "plugins_unavailable" }, 503);
    }
    deps.onPluginsChanged?.();
    return c.json({ pluginId: plugin.manifest.id, enabled: body.value.enabled });
  });
}

async function readPermissions(request: Request): Promise<string[] | null> {
  const body = await readJson(request);
  if (!body.ok || !isRecord(body.value) || !Array.isArray(body.value.acceptedPermissions)) return null;
  if (body.value.acceptedPermissions.length > 12) return null;
  const accepted: string[] = [];
  for (const item of body.value.acceptedPermissions) {
    if (typeof item !== "string" || !KNOWN.has(item)) return null;
    accepted.push(item);
  }
  return accepted;
}

function fail(c: { json: (body: unknown, status?: number) => Response }, error: unknown): Response {
  if (error instanceof MarketplaceError) {
    return c.json({ error: error.code }, statusFor(error.code));
  }
  return c.json({ error: "plugins_unavailable" }, 503);
}

function statusFor(code: string): number {
  switch (code) {
    case "unknown_plugin":
      return 404;
    case "payment_official_only":
    case "community_not_installable":
    case "not_official_allowlist":
      return 403;
    case "registry_untrusted":
      return 503;
    default:
      return 409;
  }
}
