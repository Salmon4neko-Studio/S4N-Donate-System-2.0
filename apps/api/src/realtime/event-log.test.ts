import assert from "node:assert/strict";
import type { Server } from "node:http";
import { test } from "node:test";
import { serve } from "@hono/node-server";
import { acceptEventId, asUntrustedText, nextCursor, type ChatMessagePayload } from "@s4n/events";
import { WebSocket, WebSocketServer } from "ws";
import { createPrisma } from "../db.js";
import { createOfficialCatalog } from "../plugins/catalog.js";
import { createTestApp } from "../test/fixture.js";
import { createDurableBus, createCoreBus } from "./bus.js";
import { EventPayloadError, createMemoryEventStore } from "./event-store.js";
import { mountOverlaySocket } from "./overlay-socket.js";
import { createPostgresEventStore } from "./postgres-store.js";
import { collectReplay } from "./replay.js";
import { purgeExpired } from "./retention.js";

function chat(messageId: string, text: string): ChatMessagePayload {
  return {
    platform: "twitch",
    channel: "s4n",
    userId: "1",
    login: "ada",
    displayName: asUntrustedText("Ada"),
    color: null,
    badges: [],
    fragments: [{ type: "text", text: asUntrustedText(text) }],
    text: asUntrustedText(text),
    timestamp: "2026-01-01T00:00:00.000Z",
    messageId,
    flags: { isMod: false, isBroadcaster: false, isSubscriber: false, isVip: false },
  };
}

function preview(donationId: string) {
  return {
    donationId,
    providerId: "s4n.test" as const,
    amountMinor: 300,
    currency: "TWD" as const,
    donorName: asUntrustedText("夜雨"),
    message: asUntrustedText("這首歌我很喜歡"),
    test: true as const,
  };
}

test("acceptEventId drops a duplicate and nextCursor only moves forward", () => {
  const first = acceptEventId([], "a");
  assert.equal(first.fresh, true);
  const second = acceptEventId(first.seen, "a");
  assert.equal(second.fresh, false);
  assert.deepEqual(second.seen, ["a"]);
  const capped = acceptEventId(["a", "b"], "c", 2);
  assert.deepEqual(capped.seen, ["b", "c"]);
  assert.equal(nextCursor(null, "4"), "4");
  assert.equal(nextCursor("4", "3"), "4");
  assert.equal(nextCursor("4", "10"), "10");
  assert.equal(nextCursor("4", "nope"), "4");
});

test("events are ordered, replayed after the cursor, and capped", async () => {
  const bus = createCoreBus();
  const first = await bus.publish("s4n.donation.test", preview("test_order_1"));
  const second = await bus.publish("s4n.donation.test", preview("test_order_2"));
  const third = await bus.publish("s4n.donation.test", preview("test_order_3"));
  assert.ok(BigInt(first.sequence) < BigInt(second.sequence));
  assert.ok(BigInt(second.sequence) < BigInt(third.sequence));

  const afterFirst = await bus.readAfter(BigInt(first.sequence), 10);
  assert.deepEqual(
    afterFirst.map((event) => event.id),
    [second.id, third.id],
  );

  const replay = await collectReplay(bus, 0n, 2, (event) => event.type === "s4n.donation.test");
  assert.equal(replay.truncated, true);
  assert.deepEqual(
    replay.events.map((event) => event.id),
    [first.id, second.id],
  );
  await bus.close();
});

test("a donation event is stored once and a second publish does not alert again", async () => {
  const bus = createCoreBus();
  const seen: string[] = [];
  bus.subscribe((event) => {
    seen.push(event.id);
  });
  const payload = {
    donationId: "order-once",
    providerId: "official.ecpay",
    providerRef: "ref-1",
    amountMinor: 100,
    currency: "TWD",
    donorName: asUntrustedText("小光"),
    message: asUntrustedText("謝謝"),
  };
  const first = await bus.publish("s4n.donation.succeeded", payload);
  const second = await bus.publish("s4n.donation.succeeded", payload);
  assert.equal(second.id, first.id);
  assert.equal(second.sequence, first.sequence);
  assert.deepEqual(seen, [first.id]);
  assert.equal((await bus.readAfter(0n, 10)).length, 1);
  await bus.close();
});

test("a secret field is rejected and nothing is stored", async () => {
  const bus = createCoreBus();
  await assert.rejects(
    () =>
      bus.publish("s4n.goal.updated", {
        goalId: "g",
        title: "麥克風",
        currentMinor: 1,
        targetMinor: 2,
        currency: "TWD",
        hashKey: "do-not-store",
      } as never),
    (error: unknown) => error instanceof EventPayloadError && /secret field/.test(error.message) && !/do-not-store/.test(error.message),
  );
  assert.equal((await bus.readAfter(0n, 10)).length, 0);
  await bus.close();
});

test("the log survives a new bus, and subscribers are not replayed history", async () => {
  const store = createMemoryEventStore();
  const first = createDurableBus(store, { pollMs: 0 });
  const published = await first.publish("s4n.donation.test", preview("test_restart"));
  await first.close();

  const second = createDurableBus(store, { pollMs: 0 });
  const seen: string[] = [];
  second.subscribe((event) => {
    seen.push(event.id);
  });
  await second.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(seen, []);
  const replay = await second.readAfter(0n, 10);
  assert.equal(replay.length, 1);
  assert.equal(replay[0]?.id, published.id);
  assert.equal(replay[0]?.sequence, published.sequence);
  await second.close();
  await store.close();
});

test("another bus on the same log observes a publish", async () => {
  const store = createMemoryEventStore();
  const left = createDurableBus(store, { pollMs: 0 });
  const right = createDurableBus(store, { pollMs: 0 });
  await left.start();
  await right.start();
  const seen: string[] = [];
  right.subscribe((event) => {
    seen.push(event.id);
  });
  const published = await left.publish("s4n.donation.test", preview("test_fanout"));
  await waitFor(() => seen.length === 1);
  assert.deepEqual(seen, [published.id]);
  await left.close();
  await right.close();
  await store.close();
});

test("chat retention is shorter than donation retention and sequences are not reused", async () => {
  let clock = new Date("2026-01-01T00:00:00.000Z");
  const store = createMemoryEventStore();
  const bus = createDurableBus(store, { now: () => clock });
  const oldChat = await bus.publish("s4n.chat.message", chat("old", "舊的"));
  clock = new Date("2026-01-02T12:00:00.000Z");
  const freshChat = await bus.publish("s4n.chat.message", chat("fresh", "新的"));
  clock = new Date("2026-01-03T00:00:00.000Z");
  const donation = await bus.publish("s4n.donation.test", preview("test_keep"));
  const firstPurge = await purgeExpired(store, { chatMs: 24 * 60 * 60 * 1000, defaultMs: 7 * 86_400_000 }, clock);
  assert.equal(firstPurge.chat, 1);
  assert.equal(firstPurge.other, 0);
  const kept = await bus.readAfter(0n, 10);
  assert.deepEqual(
    kept.map((event) => event.id),
    [freshChat.id, donation.id],
  );
  assert.ok(!kept.some((event) => event.id === oldChat.id));

  clock = new Date("2026-01-11T00:00:00.000Z");
  const secondPurge = await purgeExpired(store, { chatMs: 24 * 60 * 60 * 1000, defaultMs: 7 * 86_400_000 }, clock);
  assert.equal(secondPurge.chat, 1);
  assert.equal(secondPurge.other, 1);
  assert.equal((await bus.readAfter(0n, 10)).length, 0);
  const after = await bus.publish("s4n.donation.test", preview("test_after_purge"));
  assert.ok(BigInt(after.sequence) > BigInt(donation.sequence));
  await bus.close();
  await store.close();
});

test("an overlay reconnect replays missed alerts in order and does not repeat them", async () => {
  const bus = createCoreBus();
  const fixture = createTestApp({ bus });
  const sockets = new WebSocketServer({ noServer: true });
  mountOverlaySocket(fixture.app, {
    bus,
    catalog: createOfficialCatalog(),
    replayLimit: 10,
    tokenValid: async (token) => token === "overlay-token",
    pluginEnabled: async (pluginId) => pluginId === "official.alerts",
    readPublicSettings: async () => ({}),
  });
  const server = await listen(fixture.app.fetch, sockets);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `ws://127.0.0.1:${address.port}/ws/overlay?token=overlay-token&plugin=official.alerts`;
  try {
    const first = await connectedSocket(url);
    const ready = JSON.parse(await waitForMessage(first, (raw) => raw.includes("overlay socket ready"))) as {
      sequence?: string;
    };
    assert.equal(typeof ready.sequence, "string");
    first.ws.close();

    const missedA = await bus.publish("s4n.donation.test", preview("test_missed_a"));
    const missedB = await bus.publish("s4n.donation.test", preview("test_missed_b"));
    const second = await connectedSocket(`${url}&since=${ready.sequence}`);
    const replayedA = JSON.parse(await waitForMessage(second, (raw) => raw.includes(missedA.id))) as {
      channel?: string;
      event?: { id?: string; sequence?: string; type?: string };
    };
    const replayedB = JSON.parse(await waitForMessage(second, (raw) => raw.includes(missedB.id))) as {
      event?: { id?: string; sequence?: string };
    };
    assert.equal(replayedA.channel, "event");
    assert.equal(replayedA.event?.type, "s4n.donation.test");
    assert.equal(replayedA.event?.id, missedA.id);
    assert.ok(BigInt(replayedA.event?.sequence ?? "0") < BigInt(replayedB.event?.sequence ?? "0"));
    const readyAgain = JSON.parse(await waitForMessage(second, (raw) => raw.includes("overlay socket ready"))) as {
      sequence?: string;
      replayTruncated?: boolean;
    };
    assert.equal(readyAgain.replayTruncated, false);
    assert.equal(readyAgain.sequence, missedB.sequence);
    second.ws.close();

    const third = await connectedSocket(`${url}&since=${missedB.sequence}`);
    await waitForMessage(third, (raw) => raw.includes("overlay socket ready"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(
      third.messages.some((raw) => raw.includes(missedA.id) || raw.includes(missedB.id)),
      false,
    );
    third.ws.close();
  } finally {
    await bus.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sockets.close();
  }
});

test("postgres LISTEN delivers across two buses and a restart keeps the row", async (t) => {
  const databaseUrl = process.env.DATABASE_URL ?? "postgresql://s4n:s4n_dev_password@localhost:5432/s4n";
  const prisma = createPrisma(databaseUrl);
  try {
    await prisma.$queryRaw`SELECT 1 FROM "EventLog" LIMIT 1`;
  } catch {
    await prisma.$disconnect();
    t.skip("postgres event log is not reachable");
    return;
  }

  const marker = `ptest-${Date.now()}`;
  const storeA = createPostgresEventStore(prisma, databaseUrl);
  const storeB = createPostgresEventStore(prisma, databaseUrl);
  const busA = createDurableBus(storeA, { pollMs: 0 });
  const busB = createDurableBus(storeB, { pollMs: 0 });
  try {
    await busA.start();
    await busB.start();
    const seen: string[] = [];
    busB.subscribe((event) => {
      if (event.type === "s4n.donation.test" && event.payload.donationId === marker) seen.push(event.id);
    });
    const before = await busA.head();
    const published = await busA.publish("s4n.donation.test", preview(marker));
    await busA.publish("s4n.chat.message", chat(`${marker}-a`, "第一則"));
    await busA.publish("s4n.chat.message", chat(`${marker}-b`, "第二則"));
    await waitFor(() => seen.length === 1);
    assert.deepEqual(seen, [published.id]);
    const chats = await busA.readAfter(before, 20);
    assert.equal(chats.filter((event) => event.type === "s4n.chat.message").length, 2);
    await busA.close();
    await busB.close();

    const storeC = createPostgresEventStore(prisma, databaseUrl);
    const busC = createDurableBus(storeC, { pollMs: 0 });
    const replayed: string[] = [];
    busC.subscribe((event) => {
      replayed.push(event.id);
    });
    await busC.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(replayed, []);
    const rows = await busC.readAfter(before, 20);
    assert.equal(
      rows.some((event) => event.id === published.id),
      true,
    );
    await busC.close();
    await storeC.close();
  } finally {
    await busA.close();
    await busB.close();
    await storeA.close();
    await storeB.close();
    await prisma.eventLog.deleteMany({ where: { donationId: marker } });
    await prisma.$executeRaw`DELETE FROM "EventLog" WHERE payload->>'messageId' LIKE ${`${marker}%`}`;
    await prisma.$disconnect();
  }
});

function waitFor(predicate: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > 3_000) {
        clearInterval(timer);
        reject(new Error("timed out waiting for the event bus"));
      }
    }, 15);
  });
}

function listen(fetch: (request: Request) => Response | Promise<Response>, sockets: WebSocketServer): Promise<Server> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("listen timeout")), 5_000);
    let server!: Server;
    server = serve(
      {
        fetch: fetch as Parameters<typeof serve>[0]["fetch"],
        port: 0,
        hostname: "127.0.0.1",
        websocket: { server: sockets },
      },
      () => {
        clearTimeout(timer);
        resolve(server);
      },
    ) as Server;
    server.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

interface LiveSocket {
  ws: WebSocket;
  messages: string[];
}

function connectedSocket(url: string): Promise<LiveSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: string[] = [];
    ws.on("message", (data) => {
      messages.push(String(data));
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("open timeout"));
    }, 3_000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve({ ws, messages });
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForMessage(socket: LiveSocket, match: (raw: string) => boolean): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    const found = socket.messages.find(match);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`message timeout: ${socket.messages.join(" | ")}`);
}
