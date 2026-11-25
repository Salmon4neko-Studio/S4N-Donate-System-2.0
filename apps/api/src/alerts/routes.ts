import type { Hono } from "hono";
import { isAlertSoundName } from "s4n-donate-system-2.0-plugin-alerts";
import type { MiddlewareHandler } from "hono";
import type { SessionEnv } from "../auth/session.js";
import { MarketplaceError, type MarketplaceService } from "../plugins/marketplace/service.js";
import type { SecretStore } from "../plugins/settings.js";
import { ALERT_SOUND_FIELD, ALERT_SOUND_MAX_BYTES, type AlertSoundStore } from "./sound.js";

const ALERTS_ID = "official.alerts";

export function registerAlertSoundRoutes(
  app: Hono<SessionEnv>,
  deps: {
    alertSounds?: AlertSoundStore;
    secrets: SecretStore;
    marketplace: MarketplaceService;
    session: MiddlewareHandler<SessionEnv>;
    guard: MiddlewareHandler<SessionEnv>;
    overlayOperatorId: (token: string) => Promise<string | null>;
    version: string;
  },
): void {
  app.post("/api/plugins/official.alerts/sound", deps.session, deps.guard, async (c) => {
    if (deps.alertSounds === undefined) return c.json({ error: "sound_unavailable" }, 503);
    const length = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(length) && length > ALERT_SOUND_MAX_BYTES + 8_192) {
      return c.json({ error: "too_large" }, 422);
    }
    const installed = await requireInstalled(deps.marketplace);
    if (installed !== true) return c.json({ error: installed }, installed === "plugins_unavailable" ? 503 : 409);

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "invalid_sound" }, 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await deps.alertSounds.save(bytes, file.type || "");
    if ("error" in saved) {
      return c.json({ error: saved.error === "too_large" ? "too_large" : "invalid_sound" }, 422);
    }
    try {
      const previous = await replaceSoundName(deps.secrets, deps.version, saved.name);
      if (typeof previous === "string" && previous !== saved.name) await deps.alertSounds.remove(previous);
    } catch {
      await deps.alertSounds.remove(saved.name);
      return c.json({ error: "sound_unavailable" }, 503);
    }
    return c.json({ configured: true });
  });

  app.delete("/api/plugins/official.alerts/sound", deps.session, deps.guard, async (c) => {
    if (deps.alertSounds === undefined) return c.json({ error: "sound_unavailable" }, 503);
    const installed = await requireInstalled(deps.marketplace);
    if (installed !== true) return c.json({ error: installed }, installed === "plugins_unavailable" ? 503 : 409);
    try {
      const previous = await replaceSoundName(deps.secrets, deps.version, null);
      if (typeof previous === "string") await deps.alertSounds.remove(previous);
    } catch {
      return c.json({ error: "sound_unavailable" }, 503);
    }
    return c.json({ configured: false });
  });

  app.get("/api/plugins/official.alerts/sound", deps.session, async (c) => {
    return sendConfiguredSound(c, deps.alertSounds, deps.secrets);
  });

  app.get("/api/overlay/alerts/sound", async (c) => {
    c.header("cache-control", "no-store");
    const operatorId = await deps.overlayOperatorId(c.req.query("token") ?? "");
    if (operatorId === null) return c.json({ error: "unauthorized" }, 401);
    return sendConfiguredSound(c, deps.alertSounds, deps.secrets);
  });
}

async function requireInstalled(marketplace: MarketplaceService): Promise<true | string> {
  await marketplace.ready();
  if (!marketplace.isTrusted()) return true;
  try {
    const listing = await marketplace.listing(ALERTS_ID);
    if (!listing.installed) return "not_installed";
    return true;
  } catch (error) {
    if (error instanceof MarketplaceError && error.code === "unknown_plugin") return "unknown_plugin";
    if (error instanceof MarketplaceError) return error.code;
    return "plugins_unavailable";
  }
}

async function replaceSoundName(secrets: SecretStore, version: string, name: string | null): Promise<string | undefined> {
  const current = await secrets.readPublicSettings(ALERTS_ID);
  const previous = current[ALERT_SOUND_FIELD];
  const publicSettings = { ...current };
  if (name === null) delete publicSettings[ALERT_SOUND_FIELD];
  else publicSettings[ALERT_SOUND_FIELD] = name;
  await secrets.write(ALERTS_ID, { version, publicSettings, secrets: {} });
  return typeof previous === "string" ? previous : undefined;
}

async function sendConfiguredSound(
  c: { header: (name: string, value: string) => void; json: (body: unknown, status?: number) => Response },
  sounds: AlertSoundStore | undefined,
  secrets: SecretStore,
): Promise<Response> {
  if (sounds === undefined) return c.json({ error: "sound_unavailable" }, 503);
  let settings: Record<string, string | number | boolean>;
  try {
    settings = await secrets.readPublicSettings(ALERTS_ID);
  } catch {
    return c.json({ error: "sound_unavailable" }, 503);
  }
  const name = settings[ALERT_SOUND_FIELD];
  if (typeof name !== "string" || !isAlertSoundName(name)) return c.json({ configured: false }, 404);
  const stored = await sounds.read(name);
  if (stored === null) return c.json({ configured: false }, 404);
  c.header("cache-control", "no-store");
  c.header("content-type", stored.contentType);
  return new Response(stored.bytes, {
    status: 200,
    headers: {
      "content-type": stored.contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
