import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import { readSessionId } from "../auth/cookie.js";
import type { SessionEnv } from "../auth/session.js";
import type { CoreBus, DeliveredEvent } from "./bus.js";
import { collectReplay, parseSince } from "./replay.js";
import { toEventLogEntry } from "./summary.js";

interface Client {
  ws: WSContext;
  cursor: bigint;
  buffer: DeliveredEvent[];
  replaying: boolean;
  closed: boolean;
}

export interface DashboardSocketDeps {
  bus: CoreBus;
  sessionValid: (sessionId: string | undefined) => Promise<boolean>;
  replayLimit?: number;
}

/**
 * Operator socket. The session cookie authenticates it. `since` replays missed
 * log rows in order. Payloads are projected to a short summary before they leave.
 */
export function mountDashboardSocket(app: Hono<SessionEnv>, deps: DashboardSocketDeps): void {
  const clients = new Set<Client>();
  const replayLimit = deps.replayLimit ?? 200;

  deps.bus.subscribe((event) => {
    for (const client of clients) {
      if (client.replaying) {
        client.buffer.push(event);
        continue;
      }
      deliver(client, event);
    }
  });

  app.get(
    "/ws/dashboard",
    upgradeWebSocket((c) => {
      const sessionId = readSessionId(c);
      const since = parseSince(c.req.query("since"));
      let client: Client | undefined;
      return {
        async onOpen(_event, ws) {
          let valid = false;
          try {
            valid = await deps.sessionValid(sessionId);
          } catch {
            valid = false;
          }
          if (!valid) {
            ws.close(4001, "unauthorized");
            return;
          }
          client = { ws, cursor: since ?? 0n, buffer: [], replaying: true, closed: false };
          clients.add(client);
          let replayTruncated = false;
          try {
            if (since === null) {
              client.cursor = await deps.bus.head();
            } else {
              const replay = await collectReplay(deps.bus, since, replayLimit, () => true);
              replayTruncated = replay.truncated;
              for (const event of replay.events) deliver(client, event);
            }
          } catch {
            replayTruncated = false;
          }
          if (client.closed) return;
          client.replaying = false;
          const pending = client.buffer.splice(0);
          for (const event of pending) deliver(client, event);
          try {
            client.ws.send(
              JSON.stringify({
                channel: "system",
                message: "dashboard socket ready",
                sequence: client.cursor.toString(),
                replayTruncated,
              }),
            );
          } catch {
            client.closed = true;
            clients.delete(client);
          }
        },
        onClose() {
          if (client !== undefined) {
            client.closed = true;
            clients.delete(client);
          }
        },
      };
    }),
  );
}

function deliver(client: Client, event: DeliveredEvent): void {
  if (client.closed) return;
  const sequence = BigInt(event.sequence);
  if (sequence <= client.cursor) return;
  client.cursor = sequence;
  try {
    client.ws.send(JSON.stringify({ channel: "event", event: toEventLogEntry(event) }));
  } catch {
    client.closed = true;
  }
}
