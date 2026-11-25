import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { serve } from "@hono/node-server";
import { asUntrustedText } from "s4n-donate-system-2.0-events";
import { WebSocket, WebSocketServer } from "ws";
import { createOfficialCatalog } from "../plugins/catalog.js";
import { shouldForwardToOverlay } from "./audience.js";
import { mountOverlaySocket } from "./overlay-socket.js";
import { createCoreBus } from "./bus.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

test("overlay forwarding follows the enabled plugin, not every event", () => {
  const enabled = new Set(["official.alerts"]);
  const succeeded = {
    type: "s4n.donation.succeeded",
    id: "e1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: {
      donationId: "d",
      providerId: "official.ecpay",
      providerRef: "ref",
      amountMinor: 100,
      currency: "TWD",
      donorName: asUntrustedText("小光"),
      message: asUntrustedText("嗨"),
    },
  } as const;
  const preview = {
    type: "s4n.donation.test",
    id: "e2",
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: {
      donationId: "test_d",
      providerId: "s4n.test",
      amountMinor: 100,
      currency: "TWD",
      donorName: asUntrustedText("小光"),
      message: asUntrustedText("嗨"),
      test: true,
    },
  } as const;

  assert.equal(shouldForwardToOverlay(succeeded, "official.alerts", enabled), true);
  assert.equal(shouldForwardToOverlay(preview, "official.alerts", enabled), true);
  assert.equal(shouldForwardToOverlay(succeeded, "official.alerts", new Set()), false);
  assert.equal(shouldForwardToOverlay(succeeded, "official.goals", enabled), false);
  assert.equal(
    shouldForwardToOverlay(
      {
        type: "s4n.chat.message",
        id: "e3",
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: {
          platform: "twitch",
          channel: "c",
          userId: "1",
          login: "a",
          displayName: asUntrustedText("a"),
          color: null,
          badges: [],
          fragments: [{ type: "text", text: asUntrustedText("t") }],
          text: asUntrustedText("t"),
          timestamp: "2026-01-01T00:00:00.000Z",
          messageId: "m",
          flags: { isMod: false, isBroadcaster: false, isSubscriber: false, isVip: false },
        },
      },
      "official.alerts",
      enabled,
    ),
    false,
  );
  assert.equal(
    shouldForwardToOverlay(
      {
        type: "s4n.chat.message",
        id: "e3",
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: {
          platform: "twitch",
          channel: "c",
          userId: "1",
          login: "a",
          displayName: asUntrustedText("a"),
          color: null,
          badges: [],
          fragments: [{ type: "text", text: asUntrustedText("t") }],
          text: asUntrustedText("t"),
          timestamp: "2026-01-01T00:00:00.000Z",
          messageId: "m",
          flags: { isMod: false, isBroadcaster: false, isSubscriber: false, isVip: false },
        },
      },
      "official.chat-overlay",
      new Set(["official.chat-overlay"]),
    ),
    true,
  );
});

test("overlay tokens can be regenerated and the previous token is revoked", { timeout: 30_000 }, async () => {
  const fixture = createTestApp();
  const sockets = new WebSocketServer({ noServer: true });
  mountOverlaySocket(fixture.app, {
    bus: fixture.bus,
    catalog: createOfficialCatalog(),
    tokenValid: (token) => fixture.auth.overlayTokenValid(token),
    pluginEnabled: async (pluginId) => (await fixture.installations.enabledIds()).has(pluginId),
    readPublicSettings: (pluginId) => fixture.secrets.readPublicSettings(pluginId),
  });
  const server = await listen(fixture.app.fetch, sockets);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  try {
    const cookie = await setupOperator(fixture.app);
    const denied = await fixture.app.request("/api/overlay/token", { method: "POST" });
    assert.equal(denied.status, 401);

    const first = await issue(fixture.app, cookie);
    assert.equal(await fixture.auth.overlayTokenValid(first), true);
    const second = await issue(fixture.app, cookie);
    assert.notEqual(first, second);
    assert.equal(await fixture.auth.overlayTokenValid(first), false);
    assert.equal(await fixture.auth.overlayTokenValid(second), true);

    const current = await fixture.app.request("/api/overlay", { headers: { cookie } });
    const currentBody = (await current.json()) as {
      url?: string;
      chatUrl?: string;
      canvas?: { width?: number; height?: number };
    };
    const page = new URL(currentBody.url ?? "");
    assert.equal(page.searchParams.get("token"), second);
    assert.equal(page.searchParams.get("plugin"), null);
    assert.equal(page.searchParams.get("transparent"), "1");
    assert.equal(currentBody.chatUrl, undefined);
    assert.equal(currentBody.canvas?.width, 1920);
    assert.equal(currentBody.canvas?.height, 1080);
    assert.equal(JSON.stringify(currentBody).includes("clientSecret"), false);
    assert.equal(JSON.stringify(currentBody).includes("clientId"), false);

    assert.equal(await closeCode(`ws://127.0.0.1:${port}/ws/overlay`), 4001);
    assert.equal(
      await closeCode(`ws://127.0.0.1:${port}/ws/overlay?token=${encodeURIComponent(first)}`),
      4001,
    );

    await fixture.installations.setEnabled("official.alerts", true, "0.0.0");
    const live = await connectedSocket(
      `ws://127.0.0.1:${port}/ws/overlay?token=${encodeURIComponent(second)}&plugin=official.alerts`,
    );
    const ready = JSON.parse(await waitForMessage(live, (raw) => raw.includes("overlay socket ready"))) as {
      channel?: string;
      enabled?: boolean;
    };
    assert.equal(ready.channel, "system");
    assert.equal(ready.enabled, true);

    fixture.bus.publish("s4n.donation.test", {
      donationId: "test_overlay",
      providerId: "s4n.test",
      amountMinor: 300,
      currency: "TWD",
      donorName: asUntrustedText("夜雨"),
      message: asUntrustedText("這首歌我很喜歡"),
      test: true,
    });
    const forwarded = JSON.parse(await waitForMessage(live, (raw) => raw.includes("s4n.donation.test"))) as {
      channel?: string;
      event?: { type?: string };
    };
    assert.equal(forwarded.channel, "event");
    assert.equal(forwarded.event?.type, "s4n.donation.test");
    live.ws.close();

    await fixture.installations.setEnabled("official.alerts", false, "0.0.0");
    const quiet = await connectedSocket(
      `ws://127.0.0.1:${port}/ws/overlay?token=${encodeURIComponent(second)}&plugin=official.alerts`,
    );
    await waitForMessage(quiet, (raw) => raw.includes("overlay socket ready"));
    const before = quiet.messages.length;
    fixture.bus.publish("s4n.donation.succeeded", {
      donationId: "paid",
      providerId: "official.ecpay",
      providerRef: "ref",
      amountMinor: 500,
      currency: "TWD",
      donorName: asUntrustedText("小光"),
      message: asUntrustedText("謝謝"),
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      quiet.messages.slice(before).some((raw) => raw.includes("s4n.donation.succeeded")),
      false,
    );
    quiet.ws.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sockets.close();
  }
});

async function issue(app: ReturnType<typeof createTestApp>["app"], cookie: string): Promise<string> {
  const response = await app.request("/api/overlay/token", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url?: string };
  const token = new URL(body.url ?? "http://invalid").searchParams.get("token");
  assert.ok(token);
  return token;
}

function listen(fetch: (request: Request) => Response | Promise<Response>, sockets: WebSocketServer): Promise<Server> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("listen timeout")), 5000);
    let server!: Server;
    server = serve(
      {
        fetch: fetch as Parameters<typeof serve>[0]["fetch"],
        port: 0,
        hostname: "127.0.0.1",
        websocket: { server: sockets },
      },
      (_info: AddressInfo) => {
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
    }, 3000);
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
  while (Date.now() - started < 3000) {
    const found = socket.messages.find(match);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("message timeout");
}

function closeCode(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("timeout"));
    }, 3000);
    ws.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    ws.once("error", () => {
      // The close event carries the code.
    });
  });
}

test("the in-memory bus still delivers inside the publishing process", async () => {
  const bus = createCoreBus();
  let seen = 0;
  bus.subscribe(() => {
    seen += 1;
  });
  await bus.publish("s4n.donation.test", {
    donationId: "test_local",
    providerId: "s4n.test",
    amountMinor: 1,
    currency: "TWD",
    donorName: asUntrustedText("a"),
    message: asUntrustedText("b"),
    test: true,
  });
  assert.equal(seen, 1);
  await bus.close();
});
