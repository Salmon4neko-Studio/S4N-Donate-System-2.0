import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hono } from "hono";
import { asUntrustedText, type AnyS4nEvent } from "s4n-donate-system-2.0-events";
import type { PaymentProvider } from "s4n-donate-system-2.0-plugin-sdk";
import { aioCheckMacValue } from "s4n-donate-system-2.0-plugin-sdk/aio";
import type { SessionEnv } from "../auth/session.js";
import { PaymentRegistry } from "../plugins/catalog.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";
import { expireDueOrders } from "./expiry.js";
import { createMemoryLedger } from "./memory-ledger.js";
import type { LedgerOrder } from "./ledger.js";

const STAGE = {
  merchantId: "2000132",
  hashKey: "5294y06JbISpM5x9",
  hashIv: "v77hoKGq4kWxNNIS",
};

function notice(fields: Record<string, string>): string {
  return new URLSearchParams({ ...fields, CheckMacValue: aioCheckMacValue(fields, STAGE.hashKey, STAGE.hashIv) }).toString();
}

async function arm(app: Hono<SessionEnv>, pluginId: string, existingCookie?: string): Promise<string> {
  const cookie = existingCookie ?? (await setupOperator(app));
  const enabled = await app.request(`/api/plugins/${pluginId}/enabled`, {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabled.status, 200);
  const saved = await app.request(`/api/plugins/${pluginId}/settings`, {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ values: { ...STAGE, environment: "stage" } }),
  });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(await saved.json()).includes(STAGE.hashKey), false);
  return cookie;
}

async function donate(app: Hono<SessionEnv>, pluginId: string, amountMinor = 100): Promise<string> {
  const response = await app.request("/api/donations", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      pluginId,
      amountMinor,
      currency: "TWD",
      donorName: "小光",
      message: "這則留言不該進金流",
    }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { donationId: string; checkout: { fields: Record<string, string> } };
  assert.equal(body.checkout.fields.ChoosePayment, pluginId.endsWith("-atm") ? "ATM" : pluginId.endsWith("-cvs") ? "CVS" : "BARCODE");
  assert.equal(body.checkout.fields.ReturnURL, `https://donate.example/api/payments/${pluginId}/callback`);
  assert.equal(body.checkout.fields.PaymentInfoURL, `https://donate.example/api/payments/${pluginId}/payment-info`);
  assert.equal(body.checkout.fields.ClientRedirectURL, `https://donate.example/api/payments/${pluginId}/payment-redirect`);
  assert.equal(body.checkout.fields.OrderResultURL, undefined);
  assert.equal(body.checkout.fields.ClientBackURL, undefined);
  assert.equal(JSON.stringify(body).includes("這則留言不該進金流"), false);
  const { CheckMacValue, ...unsigned } = body.checkout.fields;
  assert.equal(CheckMacValue, aioCheckMacValue(unsigned, STAGE.hashKey, STAGE.hashIv));
  return body.donationId;
}

test("ATM payment info then payment is idempotent and rejects a bad mac or amount", { timeout: 120_000 }, async () => {
  const { app, ledger, bus } = createTestApp();
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));
  await arm(app, "official.ecpay-atm");
  const id = await donate(app, "official.ecpay-atm", 300);

  const issued = {
    MerchantID: STAGE.merchantId,
    MerchantTradeNo: id,
    RtnCode: "2",
    RtnMsg: "Get VirtualAccount Succeeded",
    TradeNo: "12345678901234567890",
    TradeAmt: "300",
    PaymentType: "ATM_TAISHIN",
    TradeDate: "2026/03/12 15:30:23",
    BankCode: "812",
    vAccount: "9103522175887271",
    ExpireDate: "2026/03/15",
  };
  const first = await app.request("/api/payments/official.ecpay-atm/payment-info", { method: "POST", body: notice(issued) });
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "1|OK");
  const stored = await ledger.getById(id);
  assert.equal(stored?.status, "awaiting");
  assert.equal(stored?.bankCode, "812");
  assert.equal(stored?.payCode, "9103522175887271");
  assert.equal(stored?.expiresAt, "2026-03-15T15:59:59.000Z");
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 0);

  const again = await app.request("/api/payments/official.ecpay-atm/payment-info", { method: "POST", body: notice(issued) });
  assert.equal(again.status, 200);
  assert.equal(await again.text(), "1|OK");

  const tampered = notice(issued).replace(/CheckMacValue=[A-F0-9]+/, `CheckMacValue=${"AB".repeat(32)}`);
  const badMac = await app.request("/api/payments/official.ecpay-atm/payment-info", { method: "POST", body: tampered });
  assert.equal(badMac.status, 400);
  assert.equal(await badMac.text(), "0|Error");

  const wrongAmount = await app.request("/api/payments/official.ecpay-atm/payment-info", {
    method: "POST",
    body: notice({ ...issued, TradeAmt: "1" }),
  });
  assert.equal(wrongAmount.status, 409);
  assert.equal(await wrongAmount.text(), "0|Error");
  assert.equal((await ledger.getById(id))?.status, "awaiting");
  assert.equal((await ledger.getById(id))?.amountMinor, 300);

  const infoCodeOnReturn = await app.request("/api/payments/official.ecpay-atm/callback", {
    method: "POST",
    body: notice(issued),
  });
  assert.equal(infoCodeOnReturn.status, 400);
  assert.equal((await ledger.getById(id))?.status, "awaiting");

  const paid = await app.request("/api/payments/official.ecpay-atm/callback", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: id,
      RtnCode: "1",
      RtnMsg: "paid",
      TradeNo: "12345678901234567890",
      TradeAmt: "300",
      PaymentType: "ATM_TAISHIN",
      PaymentDate: "2026/03/13 10:00:00",
      TradeDate: "2026/03/12 15:30:23",
      SimulatePaid: "0",
    }),
  });
  assert.equal(paid.status, 200);
  assert.equal(await paid.text(), "1|OK");
  assert.equal((await ledger.getById(id))?.status, "succeeded");
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);

  const duplicate = await app.request("/api/payments/official.ecpay-atm/callback", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: id,
      RtnCode: "1",
      RtnMsg: "paid",
      TradeNo: "12345678901234567890",
      TradeAmt: "300",
      PaymentType: "ATM_TAISHIN",
      TradeDate: "2026/03/12 15:30:23",
      SimulatePaid: "0",
    }),
  });
  assert.equal(duplicate.status, 200);
  assert.equal(await duplicate.text(), "1|OK");
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);

  const instructions = await app.request(`/api/donations/${id}/instructions`);
  const shown = await instructions.json();
  assert.equal(JSON.stringify(shown).includes("小光"), false);
  assert.equal(JSON.stringify(shown).includes("這則留言不該進金流"), false);
});

test("CVS code then barcode segments are separate plugins", { timeout: 120_000 }, async () => {
  const { app, ledger } = createTestApp();
  const cookie = await arm(app, "official.ecpay-cvs");
  await arm(app, "official.ecpay-barcode", cookie);
  const cvsId = await donate(app, "official.ecpay-cvs", 120);
  const cvs = await app.request("/api/payments/official.ecpay-cvs/payment-info", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: cvsId,
      RtnCode: "10100073",
      RtnMsg: "Get CVS Code Succeeded.",
      TradeNo: "17122100383415923452",
      TradeAmt: "120",
      PaymentType: "CVS_CVS",
      PaymentNo: "LLL17355880822",
      TradeDate: "2026/03/12 15:30:23",
      ExpireDate: "2026/03/19 20:15:00",
    }),
  });
  assert.equal(await cvs.text(), "1|OK");
  assert.equal((await ledger.getById(cvsId))?.payCode, "LLL17355880822");
  assert.equal((await ledger.getById(cvsId))?.status, "awaiting");

  const redirect = await app.request("/api/payments/official.ecpay-cvs/payment-redirect", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: cvsId,
      RtnCode: "10100073",
      RtnMsg: "Get CVS Code Succeeded.",
      TradeNo: "17122100383415923452",
      TradeAmt: "120",
      PaymentType: "CVS_CVS",
      PaymentNo: "LLL17355880822",
      TradeDate: "2026/03/12 15:30:23",
      ExpireDate: "2026/03/19 20:15:00",
    }),
  });
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get("location"), `http://localhost:5180/donate/pay?order=${cvsId}`);

  const barcodeId = await donate(app, "official.ecpay-barcode", 80);
  const barcode = await app.request("/api/payments/official.ecpay-barcode/payment-info", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: barcodeId,
      RtnCode: "10100073",
      RtnMsg: "Get CVS Code Succeeded.",
      TradeNo: "17122100383415920001",
      TradeAmt: "80",
      PaymentType: "BARCODE_BARCODE",
      Barcode1: "123456789",
      Barcode2: "234567890123",
      Barcode3: "345678901234",
      TradeDate: "2026/03/12 15:30:23",
      ExpireDate: "2026/03/19 23:59:59",
    }),
  });
  assert.equal(await barcode.text(), "1|OK");
  assert.deepEqual((await ledger.getById(barcodeId))?.barcodes, ["123456789", "234567890123", "345678901234"]);

  const crossed = await app.request("/api/payments/official.ecpay-cvs/payment-info", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: barcodeId,
      RtnCode: "10100073",
      RtnMsg: "nope",
      TradeNo: "17122100383415920001",
      TradeAmt: "80",
      PaymentType: "BARCODE_BARCODE",
      PaymentNo: "LLL17355880822",
      TradeDate: "2026/03/12 15:30:23",
      ExpireDate: "2026/03/19 20:15:00",
    }),
  });
  assert.equal(crossed.status, 400);
  assert.equal((await ledger.getById(barcodeId))?.status, "awaiting");
});

test("a number-issued code posted to the credit callback does not fail the order", { timeout: 60_000 }, async () => {
  const id = "a".repeat(20);
  const ledger = createMemoryLedger([blank(id, "official.ecpay")]);
  const { app } = createTestApp({ ledger });
  await arm(app, "official.ecpay");
  const response = await app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    body: notice({
      MerchantID: STAGE.merchantId,
      MerchantTradeNo: id,
      RtnCode: "2",
      RtnMsg: "issued",
      TradeNo: "12345678901234567890",
      TradeAmt: "500",
      PaymentType: "ATM_TAISHIN",
      BankCode: "812",
      vAccount: "9103522175887271",
      ExpireDate: "2026/03/15",
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "0|Error");
  assert.equal((await ledger.getById(id))?.status, "created");
});

test("a paid notice after expiry is held for review and does not alert", { timeout: 60_000 }, async () => {
  const id = "a".repeat(20);
  const ledger = createMemoryLedger([blank(id, "official.ecpay")]);
  assert.equal(await ledger.markExpired(id), "updated");
  const { app, bus } = createTestApp({ ledger });
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));
  await arm(app, "official.ecpay");
  const fields = {
    MerchantID: STAGE.merchantId,
    MerchantTradeNo: id,
    RtnCode: "1",
    RtnMsg: "paid",
    TradeNo: "12345678901234567890",
    TradeAmt: "500",
    PaymentType: "Credit_CreditCard",
    PaymentDate: "2026/11/18 18:00:00",
    TradeDate: "2026/11/18 17:00:00",
    SimulatePaid: "0",
    CheckMacValue: "should-be-replaced",
  };
  const first = await app.request("/api/payments/official.ecpay/callback", { method: "POST", body: notice(fields) });
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "1|OK");
  const stored = await ledger.getById(id);
  assert.equal(stored?.status, "review");
  assert.equal(stored?.reviewNotice?.TradeNo, "12345678901234567890");
  assert.equal(stored?.reviewNotice?.CheckMacValue, undefined);
  assert.equal(stored?.reviewNotice?.HashKey, undefined);
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 0);
  assert.equal(events.filter((event) => event.type === "s4n.donation.failed").length, 0);

  const second = await app.request("/api/payments/official.ecpay/callback", { method: "POST", body: notice(fields) });
  assert.equal(second.status, 200);
  assert.equal(await second.text(), "1|OK");
  assert.equal((await ledger.getById(id))?.status, "review");
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 0);

  const wrongAmount = { ...fields, TradeAmt: "1" };
  const rejected = await app.request("/api/payments/official.ecpay/callback", {
    method: "POST",
    body: notice(wrongAmount),
  });
  assert.equal(rejected.status, 409);
  assert.equal(await rejected.text(), "0|Error");
  assert.equal((await ledger.getById(id))?.status, "review");
});

test("expiry queries first and does not expire when the provider is down", async () => {
  const past = "2020-01-01T00:00:00.000Z";
  const unpaid = blank("a".repeat(20), "official.ecpay-atm");
  unpaid.expiresAt = past;
  const paid = blank("b".repeat(20), "official.opay-atm");
  paid.expiresAt = past;
  const down = blank("c".repeat(20), "official.ecpay-cvs");
  down.expiresAt = past;
  const ledger = createMemoryLedger([unpaid, paid, down]);
  const providers = new PaymentRegistry();
  const stub = (pluginId: string, tradeStatus: "unpaid" | "paid" | "down"): PaymentProvider => ({
    pluginId,
    async createPayment() {
      throw new Error("no");
    },
    async verifyCallback() {
      return { ok: false, reason: "not_implemented" };
    },
    async queryTrade(input) {
      if (tradeStatus === "down") return { ok: false, reason: "unavailable" };
      return {
        ok: true,
        orderId: input.orderId,
        providerRef: tradeStatus === "paid" ? "12345678901234567890" : "",
        amountMinor: 500,
        tradeStatus,
      };
    },
  });
  providers.register(stub("official.ecpay-atm", "unpaid"));
  providers.register(stub("official.opay-atm", "paid"));
  providers.register(stub("official.ecpay-cvs", "down"));
  const { bus, secrets, masterKey } = createTestApp({ ledger, providers });
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));
  const result = await expireDueOrders({
    now: new Date("2026-04-01T00:00:00.000Z"),
    ledger,
    providers,
    secrets,
    bus,
    masterKey,
  });
  assert.equal((await ledger.getById(unpaid.id))?.status, "expired");
  assert.equal((await ledger.getById(paid.id))?.status, "succeeded");
  assert.equal((await ledger.getById(down.id))?.status, "created");
  assert.equal(result.expired, 1);
  assert.equal(result.recorded, 1);
  assert.equal(events.filter((event) => event.type === "s4n.donation.succeeded").length, 1);
  assert.equal(events.filter((event) => event.type === "s4n.donation.test").length, 0);
});

function blank(id: string, providerId: string): LedgerOrder {
  return {
    id,
    providerId,
    amountMinor: 500,
    currency: "TWD",
    status: "created",
    providerRef: null,
    donorName: asUntrustedText("小光"),
    message: asUntrustedText("謝謝"),
    expiresAt: null,
    bankCode: null,
    payCode: null,
    barcodes: null,
    paymentType: null,
    reviewNotice: null,
  };
}
