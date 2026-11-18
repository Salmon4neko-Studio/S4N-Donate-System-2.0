import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hono } from "hono";
import { asUntrustedText, type AnyS4nEvent } from "@s4n/events";
import type { PaymentProvider } from "@s4n/plugin-sdk";
import { aioCheckMacValue, buildAioTradeQuery, verifyAioQuery } from "@s4n/plugin-sdk/aio";
import { createMemoryLedger } from "./memory-ledger.js";
import type { LedgerOrder } from "./ledger.js";
import { PaymentRegistry } from "../plugins/catalog.js";
import type { SessionEnv } from "../auth/session.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

/**
 * Public sandbox credentials from ECPay and O'Pay's own test pages.
 * https://developers.ecpay.com.tw/35542/
 * https://developers.opay.tw/Prepare/Intro
 */
const STAGE = {
  merchantId: "2000132",
  hashKey: "5294y06JbISpM5x9",
  hashIv: "v77hoKGq4kWxNNIS",
};

const endpoints = {
  stage: {
    checkout: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    query: "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
  },
  production: {
    checkout: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
    query: "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
  },
} as const;

function order(id: string, providerId: string, amount = 500, status: LedgerOrder["status"] = "created"): LedgerOrder {
  return {
    id,
    providerId,
    amountMinor: amount,
    currency: "TWD",
    status,
    providerRef: null,
    donorName: asUntrustedText("小光"),
    message: asUntrustedText("謝謝"),
    expiresAt: null,
    bankCode: null,
    payCode: null,
    barcodes: null,
    paymentType: null,
  };
}

function notice(fields: Record<string, string>, mac = aioCheckMacValue(fields, STAGE.hashKey, STAGE.hashIv)): string {
  return new URLSearchParams({ ...fields, CheckMacValue: mac }).toString();
}

function paid(tradeNo: string, amount = "500", merchantId = STAGE.merchantId): Record<string, string> {
  return {
    MerchantID: merchantId,
    MerchantTradeNo: tradeNo,
    RtnCode: "1",
    RtnMsg: "paid",
    TradeNo: "12345678901234567890",
    TradeAmt: amount,
    PaymentDate: "2026/03/12 15:30:23",
    PaymentType: "Credit_CreditCard",
    PaymentTypeChargeFee: "0",
    TradeDate: "2026/03/12 15:30:23",
    SimulatePaid: "0",
  };
}

async function arm(
  app: Hono<SessionEnv>,
  pluginId: string,
  environment: "stage" | "production",
): Promise<string> {
  const cookie = await setupOperator(app);
  const enabled = await app.request(`/api/plugins/${pluginId}/enabled`, {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabled.status, 200);
  const saved = await app.request(`/api/plugins/${pluginId}/settings`, {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ values: { ...STAGE, environment } }),
  });
  assert.equal(saved.status, 200);
  const savedText = JSON.stringify(await saved.json());
  assert.equal(savedText.includes(STAGE.hashKey), false);
  assert.equal(savedText.includes(STAGE.hashIv), false);
  assert.equal(savedText.includes(STAGE.merchantId), false);
  return cookie;
}

test("a checkout form uses the server amount and the public callback origin", { timeout: 120_000 }, async () => {
  const { app, ledger, bus } = createTestApp();
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));
  await arm(app, "official.ecpay", "stage");

  const response = await app.request("/api/donations", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      pluginId: "official.ecpay",
      amountMinor: 100,
      currency: "TWD",
      donorName: "小光",
      message: "這則留言不該進金流",
    }),
  });
  const body = (await response.json()) as {
    donationId: string;
    checkout: { action: string; fields: Record<string, string> };
  };
  const encoded = JSON.stringify(body);
  assert.equal(response.status, 201);
  assert.equal(encoded.includes(STAGE.hashKey), false);
  assert.equal(encoded.includes(STAGE.hashIv), false);
  assert.equal(encoded.includes("這則留言不該進金流"), false);
  assert.equal(encoded.includes("小光"), false);
  assert.equal(body.checkout.action, endpoints.stage.checkout);
  assert.equal(body.checkout.fields.TotalAmount, "100");
  assert.equal(body.checkout.fields.ChoosePayment, "Credit");
  assert.equal(body.checkout.fields.EncryptType, "1");
  assert.equal(body.checkout.fields.MerchantID, STAGE.merchantId);
  assert.equal(body.checkout.fields.MerchantTradeNo, body.donationId);
  assert.equal(body.checkout.fields.ReturnURL, "https://donate.example/api/payments/official.ecpay/callback");
  assert.equal(body.checkout.fields.OrderResultURL, "https://donate.example/api/payments/official.ecpay/return");
  const { CheckMacValue, ...unsigned } = body.checkout.fields;
  assert.equal(CheckMacValue, aioCheckMacValue(unsigned, STAGE.hashKey, STAGE.hashIv));
  const stored = await ledger.getById(body.donationId);
  assert.equal(stored?.status, "created");
  assert.equal(stored?.amountMinor, 100);
  assert.equal(stored?.message, "這則留言不該進金流");
  assert.equal(events.filter((event) => event.type === "s4n.donation.created").length, 1);
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 0);

  const returned = await app.request("/api/payments/official.ecpay/return", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: notice(paid(body.donationId, "100")),
  });
  assert.equal(returned.status, 303);
  assert.equal(
    returned.headers.get("location"),
    `http://localhost:5180/donate/result?order=${body.donationId}`,
  );
  assert.equal((await ledger.getById(body.donationId))?.status, "succeeded");
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);

  const options = await app.request("/api/donate/options");
  const listed = (await options.json()) as { methods: Array<{ id: string }>; minAmount: number; maxAmount: number };
  assert.deepEqual(listed.methods.map((method) => method.id), ["official.ecpay"]);
  assert.equal(listed.minAmount, 30);
  assert.equal(listed.maxAmount, 20_000);

  const status = await app.request(`/api/donations/${body.donationId}/status`);
  const statusBody = await status.json();
  assert.equal(JSON.stringify(statusBody).includes("這則留言不該進金流"), false);
  assert.equal(JSON.stringify(statusBody).includes("小光"), false);
});

test("signed callbacks are idempotent and reject bad merchant, amount, and trade numbers", { timeout: 180_000 }, async () => {
  for (const pluginId of ["official.ecpay", "official.opay"] as const) {
    const paidId = pluginId === "official.ecpay" ? "a".repeat(20) : "b".repeat(20);
    const mismatchId = pluginId === "official.ecpay" ? "c".repeat(20) : "d".repeat(20);
    const unknownId = pluginId === "official.ecpay" ? "e".repeat(20) : "f".repeat(20);
    const failedId = pluginId === "official.ecpay" ? "1".repeat(20) : "2".repeat(20);
    const ledger = createMemoryLedger([
      order(paidId, pluginId, 500),
      order(mismatchId, pluginId, 500),
      order(failedId, pluginId, 500),
    ]);
    const { app, bus } = createTestApp({ ledger });
    const events: AnyS4nEvent[] = [];
    bus.subscribe((event) => events.push(event));
    await arm(app, pluginId, "stage");

    const first = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: notice(paid(paidId, "500")),
    });
    assert.equal(first.status, 200);
    assert.equal(await first.text(), "1|OK");

    const duplicate = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: notice(paid(paidId, "500")),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(await duplicate.text(), "1|OK");
    assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);
    const succeeded = events.find((event) => event.type === "s4n.donation.succeeded");
    if (succeeded?.type === "s4n.donation.succeeded") {
      assert.equal(succeeded.payload.amountMinor, 500);
      assert.equal(succeeded.payload.donationId, paidId);
      assert.equal(succeeded.payload.providerRef, "12345678901234567890");
    }
    assert.equal((await ledger.getById(paidId))?.status, "succeeded");
    assert.equal((await ledger.getById(paidId))?.amountMinor, 500);

    const lateFailure = paid(paidId, "500");
    lateFailure.RtnCode = "0";
    const late = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      body: notice(lateFailure),
    });
    assert.equal(late.status, 200);
    assert.equal(await late.text(), "1|OK");
    assert.equal((await ledger.getById(paidId))?.status, "succeeded");
    assert.equal(events.filter((event) => event.type === "s4n.donation.failed").length, 0);

    const badMac = notice(paid(paidId, "500"), `${"A".repeat(63)}B`);
    const mismatch = await app.request(`/api/payments/${pluginId}/callback`, { method: "POST", body: badMac });
    assert.equal(mismatch.status, 400);
    assert.equal(await mismatch.text(), "0|Error");
    assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);

    const wrongMerchant = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      body: notice(paid(paidId, "500", "2000999")),
    });
    assert.equal(wrongMerchant.status, 400);
    assert.equal(await wrongMerchant.text(), "0|Error");

    const amount = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      body: notice(paid(mismatchId, "1")),
    });
    assert.equal(amount.status, 409);
    assert.equal(await amount.text(), "0|Error");
    assert.equal((await ledger.getById(mismatchId))?.status, "created");
    assert.equal((await ledger.getById(mismatchId))?.amountMinor, 500);

    const unknown = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      body: notice(paid(unknownId, "500")),
    });
    assert.equal(unknown.status, 404);
    assert.equal(await unknown.text(), "0|Error");

    const failedFields = paid(failedId, "500");
    failedFields.RtnCode = "0";
    failedFields.TradeNo = "88888888888888888888";
    const failed = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      body: notice(failedFields),
    });
    assert.equal(failed.status, 200);
    assert.equal(await failed.text(), "1|OK");
    assert.equal((await ledger.getById(failedId))?.status, "failed");
    const upgrade = paid(failedId, "500");
    upgrade.TradeNo = "88888888888888888888";
    const upgraded = await app.request(`/api/payments/${pluginId}/callback`, {
      method: "POST",
      body: notice(upgrade),
    });
    assert.equal(upgraded.status, 409);
    assert.equal(await upgraded.text(), "0|Error");
    assert.equal((await ledger.getById(failedId))?.status, "failed");
    assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);
    assert.equal(events.filter((event) => event.type === "s4n.donation.failed").length, 1);
  }
});

test("production ignores a simulated payment and stage can record one", { timeout: 120_000 }, async () => {
  const id = "abc123abc123abc123ab";
  const stageLedger = createMemoryLedger([order(id, "official.ecpay", 500)]);
  const stage = createTestApp({ ledger: stageLedger });
  const stageEvents: AnyS4nEvent[] = [];
  stage.bus.subscribe((event) => stageEvents.push(event));
  await arm(stage.app, "official.ecpay", "stage");
  const simulated = paid(id, "500");
  simulated.SimulatePaid = "1";
  const stageNotice = await stage.app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    body: notice(simulated),
  });
  assert.equal(await stageNotice.text(), "1|OK");
  assert.equal((await stageLedger.getById(id))?.status, "succeeded");
  assert.equal(stageEvents.filter((event) => event.type === "s4n.donation.succeeded").length, 1);

  const prodLedger = createMemoryLedger([order(id, "official.ecpay", 500)]);
  const prod = createTestApp({ ledger: prodLedger });
  const prodEvents: AnyS4nEvent[] = [];
  prod.bus.subscribe((event) => prodEvents.push(event));
  await arm(prod.app, "official.ecpay", "production");
  const prodNotice = await prod.app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    body: notice(simulated),
  });
  assert.equal(prodNotice.status, 200);
  assert.equal(await prodNotice.text(), "1|OK");
  assert.equal((await prodLedger.getById(id))?.status, "created");
  assert.equal(prodEvents.filter((event) => event.type === "s4n.donation.succeeded").length, 0);
});

test("trade query verification rejects a bad signature and a reconcile records one success", async () => {
  const fields = {
    MerchantID: STAGE.merchantId,
    MerchantTradeNo: "a".repeat(20),
    TradeNo: "12345678901234567890",
    TradeAmt: "500",
    TradeStatus: "1",
  };
  const material = {
    secrets: STAGE,
    settings: { environment: "stage" as const },
  };
  const signed = notice(fields);
  const parsed = verifyAioQuery(signed, material, endpoints);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.tradeStatus, "paid");
    assert.equal(parsed.amountMinor, 500);
  }
  const flipped = signed.replace(/CheckMacValue=[A-F0-9]+/, `CheckMacValue=${"AB".repeat(32)}`);
  const rejected = verifyAioQuery(flipped, material, endpoints);
  assert.equal(rejected.ok, false);

  const built = buildAioTradeQuery("a".repeat(20), material, endpoints, new Date("2026-03-12T00:00:00.000Z"));
  assert.ok(built);
  if (built) {
    const { CheckMacValue, ...rest } = built.fields;
    assert.equal(CheckMacValue, aioCheckMacValue(rest, STAGE.hashKey, STAGE.hashIv));
    assert.equal(
      built.fields.TimeStamp,
      String(Math.floor(new Date("2026-03-12T00:00:00.000Z").getTime() / 1000)),
    );
  }

  const ledger = createMemoryLedger([order("a".repeat(20), "official.ecpay", 500)]);
  const providers = new PaymentRegistry();
  const provider: PaymentProvider = {
    pluginId: "official.ecpay",
    async createPayment() {
      throw new Error("no");
    },
    async verifyCallback() {
      return { ok: false, reason: "not_implemented" };
    },
    async queryTrade() {
      return {
        ok: true,
        orderId: "a".repeat(20),
        providerRef: "12345678901234567890",
        amountMinor: 500,
        tradeStatus: "paid",
      };
    },
  };
  providers.register(provider);
  const { app, bus } = createTestApp({ ledger, providers });
  const cookie = await setupOperator(app);
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));
  const response = await app.request("/api/payments/official.ecpay/reconcile", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ orderId: "a".repeat(20) }),
  });
  assert.equal(response.status, 200);
  const again = await app.request("/api/payments/official.ecpay/reconcile", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ orderId: "a".repeat(20) }),
  });
  assert.equal(again.status, 200);
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);
  assert.equal((await ledger.getById("a".repeat(20)))?.status, "succeeded");
});
