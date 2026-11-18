import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import type { SessionEnv } from "../auth/session.js";
import type { LoadedPlugin } from "../plugins/catalog.js";
import { shouldForwardToOverlay } from "./audience.js";
import type { CoreBus, DeliveredEvent } from "./bus.js";
import { collectReplay, parseSince } from "./replay.js";

interface Client {
  ws: WSContext;
  pluginId: string;
  cursor: bigint;
  buffer: DeliveredEvent[];
  replaying: boolean;
  closed: boolean;
  /** Live events wait on this so an enablement read cannot reorder them. */
  chain: Promise<void>;
}

export interface OverlaySocketDeps {
  bus: CoreBus;
  catalog: readonly LoadedPlugin[];
  tokenValid: (token: string) => Promise<boolean>;
  pluginEnabled: (pluginId: string) => Promise<boolean>;
  readPublicSettings: (pluginId: string) => Promise<Record<string, string | number | boolean>>;
  /** Matching events replayed on reconnect. Older ones stay in the log for the dashboard. */
  replayLimit?: number;
}

/**
 * OBS browser-source socket. Authentication is the overlay token in the query
 * string, not the dashboard session cookie. A client that sends `since` receives
 * missed events in sequence order, capped by `replayLimit`.
 */
export function mountOverlaySocket(app: Hono<SessionEnv>, deps: OverlaySocketDeps): void {
  const clients = new Set<Client>();
  const lastSnapshot = new Map<Client, string>();
  const replayLimit = deps.replayLimit ?? 200;

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
      const parsed = JSON.parse(next) as {
        enabled: boolean;
        settings: Record<string, string | number | boolean>;
      };
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
        drop(client);
      }
    }
  }

  deps.bus.subscribe((event) => {
    for (const client of clients) {
      if (client.replaying) {
        client.buffer.push(event);
        continue;
      }
      client.chain = client.chain.then(() => deliverLive(client, event)).catch(() => undefined);
    }
  });

  async function deliverLive(client: Client, event: DeliveredEvent): Promise<void> {
    const sequence = BigInt(event.sequence);
    if (client.closed || sequence <= client.cursor) return;
    let enabled = false;
    try {
      enabled = await deps.pluginEnabled(client.pluginId);
    } catch {
      return;
    }
    if (sequence <= client.cursor || client.closed) return;
    if (!shouldForwardToOverlay(event, client.pluginId, enabled ? new Set([client.pluginId]) : new Set())) {
      return;
    }
    client.cursor = sequence;
    try {
      client.ws.send(JSON.stringify({ channel: "event", event }));
    } catch {
      drop(client);
    }
  }

  function drop(client: Client): void {
    client.closed = true;
    clients.delete(client);
    lastSnapshot.delete(client);
  }

  app.get(
    "/ws/overlay",
    upgradeWebSocket((c) => {
      const token = c.req.query("token") ?? "";
      const pluginId = c.req.query("plugin") ?? "official.alerts";
      const since = parseSince(c.req.query("since"));
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
          client = {
            ws,
            pluginId,
            cursor: since ?? 0n,
            buffer: [],
            replaying: true,
            closed: false,
            chain: Promise.resolve(),
          };
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
          const allowed = enabled ? new Set([pluginId]) : new Set<string>();
          let replayTruncated = false;
          try {
            if (since === null) {
              client.cursor = await deps.bus.head();
            } else {
              const replay = await collectReplay(deps.bus, since, replayLimit, (event) =>
                shouldForwardToOverlay(event, pluginId, allowed),
              );
              replayTruncated = replay.truncated;
              for (const event of replay.events) deliver(client, event, allowed);
            }
          } catch {
            replayTruncated = false;
          }
          if (client.closed) return;
          client.replaying = false;
          const pending = client.buffer.splice(0);
          for (const event of pending) deliver(client, event, allowed);
          lastSnapshot.set(client, JSON.stringify({ enabled, settings }));
          try {
            client.ws.send(
              JSON.stringify({
                channel: "system",
                message: "overlay socket ready",
                pluginId,
                enabled,
                settings,
                sequence: client.cursor.toString(),
                replayTruncated,
              }),
            );
          } catch {
            drop(client);
          }
        },
        onClose() {
          if (client !== undefined) drop(client);
        },
      };
    }),
  );
}

function deliver(client: Client, event: DeliveredEvent, allowed: ReadonlySet<string>): void {
  if (client.closed) return;
  const sequence = BigInt(event.sequence);
  if (sequence <= client.cursor) return;
  if (!shouldForwardToOverlay(event, client.pluginId, allowed)) return;
  client.cursor = sequence;
  try {
    client.ws.send(JSON.stringify({ channel: "event", event }));
  } catch {
    client.closed = true;
  }
}
