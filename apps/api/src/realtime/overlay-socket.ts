import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import type { CoreBus } from "./bus.js";

/**
 * Forwards core events to OBS browser-source sockets.
 * The socket sends a ready frame and then real events. It does not invent donations.
 */
export function mountOverlaySocket(app: Hono, bus: CoreBus): void {
  const sockets = new Set<WSContext>();

  bus.subscribe((event) => {
    const message = JSON.stringify({ channel: "event", event });
    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch {
        sockets.delete(socket);
      }
    }
  });

  app.get(
    "/ws/overlay",
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        sockets.add(ws);
        ws.send(JSON.stringify({ channel: "system", message: "overlay socket ready" }));
      },
      onClose(_event, ws) {
        sockets.delete(ws);
      },
    })),
  );
}
