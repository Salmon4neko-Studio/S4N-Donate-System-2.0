import assert from "node:assert/strict";
import { test } from "node:test";
import { clampOverlayRect } from "s4n-donate-system-2.0-plugin-sdk";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

test("overlay layout keeps ratios when the canvas size changes", async () => {
  const fixture = createTestApp();
  const cookie = await setupOperator(fixture.app);
  await fixture.installations.setEnabled("official.alerts", true, "0.2.0");
  await fixture.installations.setEnabled("official.chat-overlay", true, "0.2.0");
  await fixture.installations.setEnabled("official.goals", true, "0.1.0");
  await fixture.installations.setEnabled("official.ticker", true, "0.1.0");

  const headers = { origin: TEST_ORIGIN, cookie, "content-type": "application/json" };
  const empty = await fixture.app.request("/api/overlay", { headers: { cookie } });
  const emptyBody = (await empty.json()) as {
    canvas: { width: number; height: number };
    slots: Array<{ pluginId: string; x: number; y: number; width: number; height: number }>;
  };
  assert.equal(empty.status, 200);
  assert.equal(emptyBody.canvas.width, 1920);
  assert.equal(emptyBody.canvas.height, 1080);
  assert.deepEqual(
    emptyBody.slots.map((slot) => slot.pluginId),
    ["official.alerts", "official.chat-overlay", "official.goals", "official.ticker"],
  );
  const alertDefault = emptyBody.slots.find((slot) => slot.pluginId === "official.alerts");
  assert.equal(alertDefault?.x, 0.04);
  assert.equal(alertDefault?.y, 0.62);

  const saved = await fixture.app.request("/api/overlay/layout", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      width: 1920,
      height: 1080,
      slots: {
        "official.alerts": { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
        "official.chat-overlay": { x: 0.62, y: 0.05, width: 0.3, height: 0.9 },
      },
    }),
  });
  assert.equal(saved.status, 200);
  const savedBody = (await saved.json()) as typeof emptyBody;
  assert.equal(savedBody.slots.find((slot) => slot.pluginId === "official.alerts")?.x, 0.1);

  const resized = await fixture.app.request("/api/overlay/layout", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      width: 1280,
      height: 720,
      slots: {
        "official.alerts": { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
      },
    }),
  });
  assert.equal(resized.status, 200);
  const resizedBody = (await resized.json()) as typeof emptyBody & { url: string | null };
  assert.deepEqual(resizedBody.canvas, { width: 1280, height: 720 });
  assert.deepEqual(resizedBody.slots.find((slot) => slot.pluginId === "official.alerts"), {
    pluginId: "official.alerts",
    name: "贊助提醒",
    x: 0.1,
    y: 0.2,
    width: 0.4,
    height: 0.3,
  });
  const chat = resizedBody.slots.find((slot) => slot.pluginId === "official.chat-overlay");
  assert.equal(chat?.x, 0.62);
  assert.equal(chat?.height, 0.9);
  assert.equal(resizedBody.slots.find((slot) => slot.pluginId === "official.goals")?.y, 0.04);
  assert.equal(resizedBody.slots.find((slot) => slot.pluginId === "official.ticker")?.height, 0.12);

  const rejected = await fixture.app.request("/api/overlay/layout", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      width: 100,
      height: 1080,
      slots: { "official.alerts": { x: 0.9, y: 0.9, width: 0.3, height: 0.3 } },
    }),
  });
  assert.equal(rejected.status, 422);
  const unknown = await fixture.app.request("/api/overlay/layout", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      width: 1280,
      height: 720,
      slots: { "official.ecpay": { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
    }),
  });
  assert.equal(unknown.status, 422);

  const read = await fixture.app.request("/api/overlay", { headers: { cookie } });
  const readBody = (await read.json()) as typeof resizedBody;
  assert.equal(readBody.canvas.width, 1280);
  assert.equal(readBody.slots.find((slot) => slot.pluginId === "official.alerts")?.width, 0.4);
});

test("the scene endpoint uses the overlay token and omits secrets", async () => {
  const fixture = createTestApp();
  const cookie = await setupOperator(fixture.app);
  await fixture.installations.setEnabled("official.alerts", true, "0.2.0");
  await fixture.installations.setEnabled("official.chat-overlay", false, "0.2.0");
  const headers = { origin: TEST_ORIGIN, cookie, "content-type": "application/json" };
  await fixture.app.request("/api/plugins/official.twitch-chat/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { channel: "s4n", clientId: "twitch-id-secret", clientSecret: "twitch-secret-value" } }),
  });
  await fixture.app.request("/api/overlay/layout", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      width: 1920,
      height: 1080,
      slots: { "official.alerts": { x: 0.08, y: 0.55, width: 0.42, height: 0.28 } },
    }),
  });

  const issued = await fixture.app.request("/api/overlay/token", { method: "POST", headers });
  const issuedBody = (await issued.json()) as { url: string };
  const token = new URL(issuedBody.url).searchParams.get("token");
  assert.ok(token);

  const anonymous = await fixture.app.request("/api/overlay/scene");
  assert.equal(anonymous.status, 401);
  const scene = await fixture.app.request(`/api/overlay/scene?token=${encodeURIComponent(token)}`, {
    headers: { cookie: "s4n_session=not-used" },
  });
  assert.equal(scene.status, 200);
  const text = await scene.text();
  const body = JSON.parse(text) as {
    canvas: { width: number };
    slots: Array<{ pluginId: string; x: number }>;
    url?: string;
  };
  assert.equal(body.canvas.width, 1920);
  assert.deepEqual(
    body.slots.map((slot) => slot.pluginId),
    ["official.alerts"],
  );
  assert.equal(body.slots[0]?.x, 0.08);
  assert.equal(body.url, undefined);
  assert.equal(text.includes(token), false);
  assert.equal(text.includes("twitch-secret-value"), false);
  assert.equal(text.includes("twitch-id-secret"), false);
  assert.equal(text.includes("clientSecret"), false);
  assert.equal(text.includes("s4n"), false);
});

test("dragged rectangles stay inside the canvas", () => {
  assert.deepEqual(clampOverlayRect({ x: -0.2, y: 0.2, width: 0.3, height: 0.4 }), {
    x: 0,
    y: 0.2,
    width: 0.3,
    height: 0.4,
  });
  assert.deepEqual(clampOverlayRect({ x: 0.9, y: 0.95, width: 0.4, height: 0.2 }), {
    x: 0.6,
    y: 0.8,
    width: 0.4,
    height: 0.2,
  });
  assert.equal(clampOverlayRect({ x: 0, y: 0, width: 0.01, height: 2 }).width, 0.05);
  assert.equal(clampOverlayRect({ x: 0, y: 0, width: 0.01, height: 2 }).height, 1);
});
