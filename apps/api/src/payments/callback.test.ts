import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText, type AnyS4nEvent } from "@s4n/events";
import type { PaymentProvider } from "@s4n/plugin-sdk";
import { createMemoryLedger } from "./memory-ledger.js";
import { PaymentRegistry } from "../plugins/catalog.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

test("unknown and non-payment callbacks never touch the ledger", async () => {
  let touched = false;
  const { app } = createTestApp({
    ledger: {
      async getById() {
        touched = true;
        return null;
      },
      async markSucceeded() {
        touched = true;
        return "lost_race";
      },
      async listRecent() {
        return [];
      },
    },
  });

  const unknown = await app.request("/api/payments/community.nope/callback", { method: "POST", body: "{}" });
  assert.equal(unknown.status, 404);
  const alerts = await app.request("/api/payments/official.alerts/callback", { method: "POST", body: "{}" });
  assert.equal(alerts.status, 403);
  const stub = await app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    body: JSON.stringify({ Amount: 1 }),
  });
  assert.equal(stub.status, 501);
  assert.equal(touched, false);
});

test("a verified callback records the server order once and ignores the body amount", async () => {
  const ledger = createMemoryLedger([
    {
      id: "order_1",
      providerId: "official.ecpay",
      amountMinor: 500,
      currency: "TWD",
      status: "created",
      providerRef: null,
      donorName: asUntrustedText("小光"),
      message: asUntrustedText("謝謝"),
    },
  ]);
  const providers = new PaymentRegistry();
  const provider: PaymentProvider = {
    pluginId: "official.ecpay",
    async createPayment() {
      throw new Error("create should not run");
    },
    async verifyCallback(_input, secrets) {
      assert.equal(secrets.merchantId, "sentinel-merchant-9f3a");
      return { ok: true, orderId: "order_1", providerRef: "ref_1" };
    },
  };
  providers.register(provider);

  const { app, bus } = createTestApp({ ledger, providers });
  const cookie = await setupOperator(app);
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));

  const saved = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({
      values: {
        merchantId: "sentinel-merchant-9f3a",
        hashKey: "sentinel-hash-key-9f3a",
        hashIv: "sentinel-hash-iv-9f3a",
        environment: "stage",
      },
    }),
  });
  assert.equal(saved.status, 200);

  const rawBody = JSON.stringify({ Amount: 1, donor: "大惡意" });
  const first = await app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
  const firstBody = (await first.json()) as { status?: string };
  assert.equal(first.status, 200);
  assert.equal(firstBody.status, "recorded");
  assert.equal(JSON.stringify(firstBody).includes("小光"), false);
  assert.equal(JSON.stringify(firstBody).includes("大惡意"), false);

  const second = await app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    body: rawBody,
  });
  const secondBody = (await second.json()) as { status?: string };
  assert.equal(second.status, 200);
  assert.equal(secondBody.status, "duplicate");

  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "s4n.donation.succeeded");
  if (events[0]?.type === "s4n.donation.succeeded") {
    assert.equal(events[0].payload.amountMinor, 500);
    assert.equal(events[0].payload.donorName, "小光");
    assert.equal(events[0].payload.providerRef, "ref_1");
  }
  const stored = await ledger.getById("order_1");
  assert.equal(stored?.status, "succeeded");
  assert.equal(stored?.amountMinor, 500);
});

test("callback rate limit stops before the provider runs", async () => {
  let calls = 0;
  const providers = new PaymentRegistry();
  providers.register({
    pluginId: "official.ecpay",
    async createPayment() {
      throw new Error("no");
    },
    async verifyCallback() {
      calls += 1;
      return { ok: false, reason: "not_implemented" };
    },
  });
  const { app } = createTestApp({
    providers,
    callbackRateLimit: { windowMs: 60_000, max: 2 },
  });
  assert.equal((await app.request("/api/payments/official.ecpay/callback", { method: "POST", body: "{}" })).status, 501);
  assert.equal((await app.request("/api/payments/official.ecpay/callback", { method: "POST", body: "{}" })).status, 501);
  assert.equal((await app.request("/api/payments/official.ecpay/callback", { method: "POST", body: "{}" })).status, 429);
  assert.equal(calls, 2);
});
