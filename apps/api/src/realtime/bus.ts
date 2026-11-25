import { randomUUID } from "node:crypto";
import type { AnyS4nEvent, S4nEventMap, S4nEventName } from "s4n-donate-system-2.0-events";
import {
  assertEventPayloadSafe,
  createMemoryEventStore,
  EventLogUnavailable,
  EventPayloadError,
  isEventName,
  type EventStore,
  type StoredEvent,
} from "./event-store.js";

export type DeliveredEvent = AnyS4nEvent & { sequence: string };

export interface CoreBus {
  publish<T extends S4nEventName>(type: T, payload: S4nEventMap[T]): Promise<Extract<DeliveredEvent, { type: T }>>;
  subscribe(handler: (event: DeliveredEvent) => void): () => void;
  readAfter(after: bigint, limit: number): Promise<DeliveredEvent[]>;
  readRecent(limit: number): Promise<DeliveredEvent[]>;
  head(): Promise<bigint>;
  /**
   * Start LISTEN and the gap poller. In-process subscribers do not receive rows
   * that were already in the log. Call this before serving traffic.
   */
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface DurableBusOptions {
  now?: () => Date;
  /**
   * How often to read sequences another process inserted.
   * `0` disables the poller so a test can prove LISTEN/NOTIFY on its own.
   */
  pollMs?: number;
}

/** In-memory log used by tests. A new bus on a new store does not see old rows. */
export function createCoreBus(): CoreBus {
  return createDurableBus(createMemoryEventStore());
}

/**
 * One process's view of a shared log.
 * Subscribers must not await `publish`: a handler that does is skipped past
 * for the nested event, and the outer drain emits it afterward.
 */
export function createDurableBus(store: EventStore, options: DurableBusOptions = {}): CoreBus {
  const now = options.now ?? (() => new Date());
  const pollMs = options.pollMs ?? 1_000;
  const handlers = new Set<(event: DeliveredEvent) => void>();
  let lastDispatched = 0n;
  let mode: "idle" | "starting" | "ready" = "idle";
  let handlerDepth = 0;
  let again = false;
  let drainPromise: Promise<void> | null = null;
  let unlisten: (() => Promise<void>) | null = null;
  let poller: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function requestDrain(): Promise<void> {
    again = true;
    if (drainPromise !== null) return drainPromise;
    drainPromise = (async () => {
      try {
        while (again) {
          again = false;
          const rows = await store.readAfter(lastDispatched, 100);
          for (const row of rows) {
            if (row.sequence <= lastDispatched) continue;
            lastDispatched = row.sequence;
            const event = toDelivered(row);
            if (event === null) continue;
            for (const handler of handlers) {
              handlerDepth += 1;
              try {
                handler(event);
              } catch {
                // One subscriber must not stop delivery to the others.
              } finally {
                handlerDepth -= 1;
              }
            }
          }
          if (rows.length === 100) again = true;
        }
      } finally {
        drainPromise = null;
        if (again && !closed) void requestDrain();
      }
    })();
    return drainPromise;
  }

  async function arm(): Promise<void> {
    if (closed) return;
    mode = "starting";
    try {
      lastDispatched = await store.head();
    } catch {
      mode = "starting";
      if (!closed && retry === null) {
        retry = setTimeout(() => {
          retry = null;
          void arm();
        }, 1_000);
        retry.unref?.();
      }
      return;
    }
    mode = "ready";
    try {
      unlisten = await store.listen(() => {
        void requestDrain();
      });
    } catch {
      // The poller still observes rows inserted by other processes.
    }
    if (pollMs > 0 && poller === null) {
      poller = setInterval(() => {
        void requestDrain();
      }, pollMs);
      poller.unref?.();
    }
  }

  return {
    async publish(type, payload) {
      if (closed || mode === "starting") throw new EventLogUnavailable();
      if (!isEventName(type)) throw new EventPayloadError("unknown event type");
      assertEventPayloadSafe(payload);
      const createdAt = now();
      if (Number.isNaN(createdAt.getTime())) throw new EventPayloadError("occurredAt is invalid");
      const stored = await store.append({ id: randomUUID(), type, payload, createdAt });
      if (handlerDepth > 0) {
        again = true;
      } else {
        await requestDrain();
      }
      const event = toDelivered(stored);
      if (event === null || event.type !== type) throw new EventPayloadError("stored event is invalid");
      return event as Extract<DeliveredEvent, { type: typeof type }>;
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async readAfter(after, limit) {
      const rows = await store.readAfter(after, limit);
      return rows.flatMap((row) => {
        const event = toDelivered(row);
        return event === null ? [] : [event];
      });
    },
    async readRecent(limit) {
      const rows = await store.readRecent(limit);
      return rows.flatMap((row) => {
        const event = toDelivered(row);
        return event === null ? [] : [event];
      });
    },
    head() {
      return store.head();
    },
    start() {
      return arm();
    },
    async close() {
      closed = true;
      if (poller !== null) clearInterval(poller);
      poller = null;
      if (retry !== null) clearTimeout(retry);
      retry = null;
      if (unlisten !== null) await unlisten();
      unlisten = null;
    },
  };
}

export function toDelivered(row: StoredEvent): DeliveredEvent | null {
  if (!isEventName(row.type) || !isRecord(row.payload)) return null;
  return {
    type: row.type,
    id: row.id,
    occurredAt: row.createdAt.toISOString(),
    payload: row.payload,
    sequence: row.sequence.toString(),
  } as unknown as DeliveredEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { EventLogUnavailable, EventPayloadError };
