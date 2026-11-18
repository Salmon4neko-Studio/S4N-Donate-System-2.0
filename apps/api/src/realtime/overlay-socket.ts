import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import type { SessionEnv } from "../auth/session.js";
import type { LoadedPlugin } from "../plugins/catalog.js";
import { overlayPluginFor } from "./audience.js";
import type { CoreBus } from "./bus.js";

interface Client {
  ws: WSContext;
  pluginId: string;
}

export interface OverlaySocketDeps {
  bus: CoreBus;
  catalog: readonly LoadedPlugin[];
  tokenValid: (token: string) => Promise<boolean>;
  pluginEnabled: (pluginId: string) => Promise<boolean>;
  readPublicSettings: (pluginId: string) => Promise<Record<string, string | number | boolean>>;
}

/**
 * OBS browser-source socket. Authentication is the overlay token in the query
 * string, not the dashboard session cookie. Events are forwarded only when the
 * subscribed overlay plugin is enabled.
 */
export function mountOverlaySocket(app: Hono<SessionEnv>, deps: OverlaySocketDeps): void {
  const clients = new Set<Client>();
  const lastSnapshot = new Map<Client, string>();

  const refresh = setInterval(() => {
    void pushSettings();
  }, 2_000);
  refresh.unref?.();

  async function pushSettings(): Promise<void> {
    const ids = new Set([...clients].map((client) => client.pluginId));
    const snapshots = new Map<string, string>();
    for (const id of ids) {
      try {
        const [settings, enabled] = await Promise.all([
          deps.readPublicSettings(id),
          deps.pluginEnabled(id),
        ]);
        snapshots.set(id, JSON.stringify({ enabled, settings }));
      } catch {
        snapshots.set(id, "");
      }
    }
    for (const client of clients) {
      const next = snapshots.get(client.pluginId);
      if (next === undefined || next === "" || next === lastSnapshot.get(client)) continue;
      lastSnapshot.set(client, next);
      const parsed = JSON.parse(next) as { enabled: boolean; settings: Record<string, string | number | boolean> };
      try {
        client.ws.send(
          JSON.stringify({
            channel: "system",
            message: "overlay settings",
            pluginId: client.pluginId,
            enabled: parsed.enabled,
            settings: parsed.settings,
          }),
        );
      } catch {
        clients.delete(client);
        lastSnapshot.delete(client);
      }
    }
  }

  deps.bus.subscribe((event) => {
    const owner = overlayPluginFor(event);
    if (owner === null) return;
    void deps
      .pluginEnabled(owner)
      .then((enabled) => {
        if (!enabled) return;
        const message = JSON.stringify({ channel: "event", event });
        for (const client of clients) {
          if (client.pluginId !== owner) continue;
          try {
            client.ws.send(message);
          } catch {
            clients.delete(client);
          }
        }
      })
      .catch(() => {
        // Drop the event when enablement cannot be read.
      });
  });

  app.get(
    "/ws/overlay",
    upgradeWebSocket((c) => {
      const token = c.req.query("token") ?? "";
      const pluginId = c.req.query("plugin") ?? "official.alerts";
      let client: Client | undefined;
      return {
        async onOpen(_event, ws) {
          const plugin = deps.catalog.find((item) => item.manifest.id === pluginId);
          const isOverlay = plugin?.manifest.kind.includes("overlay") === true;
          let valid = false;
          try {
            valid = isOverlay && token !== "" && (await deps.tokenValid(token));
          } catch {
            valid = false;
          }
          if (!valid) {
            ws.close(4001, "unauthorized");
            return;
          }
          client = { ws, pluginId };
          clients.add(client);
          let settings: Record<string, string | number | boolean> = {};
          let enabled = false;
          try {
            [settings, enabled] = await Promise.all([
              deps.readPublicSettings(pluginId),
              deps.pluginEnabled(pluginId),
            ]);
          } catch {
            settings = {};
            enabled = false;
          }
          lastSnapshot.set(client, JSON.stringify({ enabled, settings }));
          ws.send(
            JSON.stringify({
              channel: "system",
              message: "overlay socket ready",
              pluginId,
              enabled,
              settings,
            }),
          );
        },
        onClose() {
          if (client !== undefined) {
            clients.delete(client);
            lastSnapshot.delete(client);
          }
        },
      };
    }),
  );
}
