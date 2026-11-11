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
          if (client !== undefined) clients.delete(client);
        },
      };
    }),
  );
}
