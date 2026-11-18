import { S4N_EVENT_NAMES, type S4nEventName } from "@s4n/events";

const MAX_PAYLOAD_CHARS = 16_384;
const MAX_DEPTH = 8;

const SECRET_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authtag",
  "ciphertext",
  "clientsecret",
  "hashiv",
  "hashkey",
  "masterkey",
  "overlaytoken",
  "password",
  "passwordhash",
  "refreshtoken",
  "secret",
  "token",
]);

export class EventPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventPayloadError";
  }
}

export class EventLogUnavailable extends Error {
  constructor() {
    super("event log is unavailable");
    this.name = "EventLogUnavailable";
  }
}

export interface NewEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

/** One row in the append-only log. `sequence` is never reused. */
export interface StoredEvent {
  sequence: bigint;
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

export interface PurgeOptions {
  olderThan: Date;
  types?: readonly string[];
  excludeTypes?: readonly string[];
}

/**
 * Durable log behind the bus. PostgreSQL is the v1 adapter.
 * A later Redis or NATS adapter can implement the same methods and fan-out.
 */
export interface EventStore {
  /**
   * Insert, or return the existing row when this donation id and type were already logged.
   * Chat and other events are not deduped here; clients dedupe by event id.
   */
  append(event: NewEvent): Promise<StoredEvent>;
  /** Strictly after `after`, ascending, at most `limit` rows. */
  readAfter(after: bigint, limit: number): Promise<StoredEvent[]>;
  /** Newest first. */
  readRecent(limit: number): Promise<StoredEvent[]>;
  /** `0n` when the log is empty. */
  head(): Promise<bigint>;
  /** Wake when any process appends. The payload of the wake is not the event. */
  listen(onAppended: () => void): Promise<() => Promise<void>>;
  purge(options: PurgeOptions): Promise<number>;
  close(): Promise<void>;
}

export function isEventName(value: string): value is S4nEventName {
  return (S4N_EVENT_NAMES as readonly string[]).includes(value);
}

/** Donation events carry this id. It is not a ledger foreign key. */
export function donationKey(type: string, payload: unknown): string | null {
  if (!type.startsWith("s4n.donation.")) return null;
  if (!isRecord(payload)) return null;
  const id = payload.donationId;
  if (typeof id !== "string" || id.length === 0 || id.length > 80) return null;
  return id;
}

/**
 * Reject secret-shaped keys and oversized JSON before anything is stored.
 * The error names the field, never the value.
 */
export function assertEventPayloadSafe(payload: unknown): void {
  let encoded: string;
  try {
    const json = JSON.stringify(payload);
    if (typeof json !== "string") throw new EventPayloadError("event payload is not json");
    encoded = json;
  } catch (error) {
    if (error instanceof EventPayloadError) throw error;
    throw new EventPayloadError("event payload is not json");
  }
  if (encoded.length > MAX_PAYLOAD_CHARS) throw new EventPayloadError("event payload is too large");
  assertNoSecretFields(JSON.parse(encoded) as unknown, "payload", 0);
}

export function createMemoryEventStore(): EventStore {
  const rows: StoredEvent[] = [];
  const donationIndex = new Map<string, StoredEvent>();
  const listeners = new Set<() => void>();
  let sequence = 0n;

  return {
    async append(event) {
      const key = donationKey(event.type, event.payload);
      if (key !== null) {
        const existing = donationIndex.get(indexKey(event.type, key));
        if (existing !== undefined) return clone(existing);
      }
      sequence += 1n;
      const stored = clone({
        sequence,
        id: event.id,
        type: event.type,
        payload: JSON.parse(JSON.stringify(event.payload)) as unknown,
        createdAt: new Date(event.createdAt.getTime()),
      });
      rows.push(stored);
      if (key !== null) donationIndex.set(indexKey(event.type, key), stored);
      for (const listener of listeners) listener();
      return clone(stored);
    },
    async readAfter(after, limit) {
      const found: StoredEvent[] = [];
      for (const row of rows) {
        if (row.sequence <= after) continue;
        found.push(clone(row));
        if (found.length >= limit) break;
      }
      return found;
    },
    async readRecent(limit) {
      return rows.slice(-limit).reverse().map(clone);
    },
    async head() {
      return sequence;
    },
    async listen(onAppended) {
      listeners.add(onAppended);
      return async () => {
        listeners.delete(onAppended);
      };
    },
    async purge(options) {
      const keep: StoredEvent[] = [];
      let removed = 0;
      for (const row of rows) {
        if (row.createdAt < options.olderThan && eligible(row.type, options)) {
          removed += 1;
          const key = donationKey(row.type, row.payload);
          if (key !== null) donationIndex.delete(indexKey(row.type, key));
          continue;
        }
        keep.push(row);
      }
      rows.length = 0;
      rows.push(...keep);
      return removed;
    },
    async close() {
      listeners.clear();
    },
  };
}

function eligible(type: string, options: PurgeOptions): boolean {
  if (options.types !== undefined && !options.types.includes(type)) return false;
  if (options.excludeTypes !== undefined && options.excludeTypes.includes(type)) return false;
  return true;
}

function indexKey(type: string, donationId: string): string {
  return `${type}\0${donationId}`;
}

function clone(event: StoredEvent): StoredEvent {
  return {
    sequence: event.sequence,
    id: event.id,
    type: event.type,
    payload: event.payload,
    createdAt: new Date(event.createdAt.getTime()),
  };
}

function assertNoSecretFields(value: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new EventPayloadError("event payload is too deep");
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretFields(item, path, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(normalizeKey(key)) || key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new EventPayloadError(`event payload contains a secret field at ${path}.${key}`);
    }
    assertNoSecretFields(child, `${path}.${key}`, depth + 1);
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
