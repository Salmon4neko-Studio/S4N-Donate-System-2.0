import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText, type ChatMessagePayload } from "@s4n/events";
import { createOfficialCatalog } from "../plugins/catalog.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";
import { createChatHost } from "./host.js";

test("donation mix-in is off by default and never writes the ledger", async () => {
  const fixture = createTestApp();
  const host = createChatHost({
    catalog: createOfficialCatalog(),
    installations: fixture.installations,
    secrets: fixture.secrets,
    masterKey: fixture.masterKey,
    bus: fixture.bus,
  });
  await fixture.installations.setEnabled("official.chat-overlay", true, "0.1.0");
  const chats: ChatMessagePayload[] = [];
  fixture.bus.subscribe((event) => {
    if (event.type === "s4n.chat.message") chats.push(event.payload);
  });

  fixture.bus.publish("s4n.donation.test", {
    donationId: "test_off",
    providerId: "s4n.test",
    amountMinor: 100,
    currency: "TWD",
    donorName: asUntrustedText("小滿"),
    message: asUntrustedText("還沒打開"),
    test: true,
  });
  await delay(40);
  assert.equal(chats.length, 0);

  await fixture.secrets.write("official.chat-overlay", {
    version: "0.1.0",
    publicSettings: { mixDonations: true },
    secrets: {},
  });
  fixture.bus.publish("s4n.donation.test", {
    donationId: "test_on",
    providerId: "s4n.test",
    amountMinor: 520,
    currency: "TWD",
    donorName: asUntrustedText("小滿"),
    message: asUntrustedText("混進聊天"),
    test: true,
  });
  await waitFor(() => chats.length === 1);
  const line = chats[0];
  assert.ok(line);
  assert.equal(line.platform, "s4n");
  assert.equal(line.donation?.test, true);
  assert.equal(line.donation?.amountMinor, 520);
  assert.equal(line.text, "混進聊天");
  assert.deepEqual(await fixture.ledger.listRecent(20), []);
  host.stop();
});

test("a test chat message is not a ledger row and keeps markup as text", async () => {
  const fixture = createTestApp();
  const cookie = await setupOperator(fixture.app);
  const chats: ChatMessagePayload[] = [];
  fixture.bus.subscribe((event) => {
    if (event.type === "s4n.chat.message") chats.push(event.payload);
  });
  const before = await fixture.ledger.listRecent(20);
  const response = await fixture.app.request("/api/chat/test", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "小滿<script>", text: "你好<img>" }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { test?: boolean };
  assert.equal(body.test, true);
  assert.deepEqual(await fixture.ledger.listRecent(20), before);
  const line = chats[0];
  assert.ok(line);
  assert.equal(line.displayName, "小滿<script>");
  assert.equal(line.text.includes("<img>"), true);
  assert.equal(line.text.includes("Kappa"), true);
  assert.equal(line.badges.some((badge) => badge.setId === "broadcaster"), true);
  assert.equal(line.fragments.some((fragment) => fragment.type === "emote" && fragment.id === "25"), true);
  assert.equal(line.donation, undefined);
  const url = new URL("http://localhost:5181/?token=abc&plugin=official.chat-overlay&transparent=1");
  assert.equal(url.searchParams.has("clientId"), false);
  assert.equal(url.searchParams.has("clientSecret"), false);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 1_000) throw new Error("timed out waiting for chat mix-in");
    await delay(10);
  }
}
