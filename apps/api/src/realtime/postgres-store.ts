import { Client } from "pg";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import {
  donationKey,
  type EventStore,
  type NewEvent,
  type PurgeOptions,
  type StoredEvent,
} from "./event-store.js";

const CHANNEL = "s4n_event_log";

/**
 * PostgreSQL adapter. LISTEN/NOTIFY wakes every API process; the payload is only
 * a signal, because NOTIFY is capped at 8000 bytes and chat lines can be larger.
 * A one-second poll in the bus covers a missed notification.
 */
export function createPostgresEventStore(prisma: PrismaClient, databaseUrl: string): EventStore {
  const listeners = new Set<() => void>();
  let client: Client | null = null;
  let connecting: Promise<void> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function emit(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A slow subscriber must not tear down LISTEN.
      }
    }
  }

  async function connect(): Promise<void> {
    if (closed || client !== null) return;
    const next = new Client({ connectionString: databaseUrl, application_name: "s4n-event-log" });
    await next.connect();
    await next.query("LISTEN s4n_event_log");
    next.on("notification", (message) => {
      if (message.channel === CHANNEL) emit();
    });
    next.on("error", () => {
      void drop(next);
    });
    next.on("end", () => {
      void drop(next);
    });
    client = next;
  }

  function scheduleReconnect(): void {
    if (closed || retry !== null || listeners.size === 0) return;
    retry = setTimeout(() => {
      retry = null;
      if (closed || listeners.size === 0) return;
      connecting = connect()
        .catch(() => {
          scheduleReconnect();
        })
        .finally(() => {
          connecting = null;
        });
    }, 1_000);
    retry.unref?.();
  }

  async function drop(dead: Client): Promise<void> {
    if (client === dead) client = null;
    try {
      dead.end();
    } catch {
      // The socket is already gone.
    }
    scheduleReconnect();
  }

  async function ensure(): Promise<void> {
    if (client !== null) return;
    if (connecting === null) {
      connecting = connect().finally(() => {
        connecting = null;
      });
    }
    await connecting;
  }

  return {
    async append(event) {
      const donationId = donationKey(event.type, event.payload);
      const payload = JSON.parse(JSON.stringify(event.payload)) as Prisma.InputJsonValue;
      try {
        const created = await prisma.$transaction(async (tx) => {
          const row = await tx.eventLog.create({
            data: {
              eventId: event.id,
              type: event.type,
              payload,
              createdAt: event.createdAt,
              ...(donationId !== null ? { donationId } : {}),
            },
          });
          await tx.$executeRaw`SELECT pg_notify(${CHANNEL}, ${row.sequence.toString()})`;
          return row;
        });
        return fromRow(created);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await findExisting(prisma, event, donationId);
        if (existing === null) throw error;
        return existing;
      }
    },
    async readAfter(after, limit) {
      const rows = await prisma.eventLog.findMany({
        where: { sequence: { gt: after } },
        orderBy: { sequence: "asc" },
        take: limit,
      });
      return rows.map(fromRow);
    },
    async readRecent(limit) {
      const rows = await prisma.eventLog.findMany({
        orderBy: { sequence: "desc" },
        take: limit,
      });
      return rows.map(fromRow);
    },
    async head() {
      const row = await prisma.eventLog.findFirst({ orderBy: { sequence: "desc" }, select: { sequence: true } });
      return row?.sequence ?? 0n;
    },
    async listen(onAppended) {
      listeners.add(onAppended);
      try {
        await ensure();
      } catch {
        scheduleReconnect();
      }
      return async () => {
        listeners.delete(onAppended);
      };
    },
    async purge(options) {
      const result = await prisma.eventLog.deleteMany({
        where: {
          createdAt: { lt: options.olderThan },
          ...(options.types !== undefined ? { type: { in: [...options.types] } } : {}),
          ...(options.excludeTypes !== undefined ? { type: { notIn: [...options.excludeTypes] } } : {}),
        },
      });
      return result.count;
    },
    async close() {
      closed = true;
      listeners.clear();
      if (retry !== null) clearTimeout(retry);
      retry = null;
      const current = client;
      client = null;
      if (current !== null) {
        try {
          await current.end();
        } catch {
          // Already closed.
        }
      }
    },
  };
}

async function findExisting(
  prisma: PrismaClient,
  event: NewEvent,
  donationId: string | null,
): Promise<StoredEvent | null> {
  const byId = await prisma.eventLog.findUnique({ where: { eventId: event.id } });
  if (byId !== null) return fromRow(byId);
  if (donationId === null) return null;
  const byDonation = await prisma.eventLog.findUnique({
    where: { type_donationId: { type: event.type, donationId } },
  });
  return byDonation === null ? null : fromRow(byDonation);
}

function fromRow(row: {
  sequence: bigint;
  eventId: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}): StoredEvent {
  return {
    sequence: row.sequence,
    id: row.eventId,
    type: row.type,
    payload: row.payload,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
