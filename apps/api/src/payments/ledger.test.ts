import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText } from "s4n-donate-system-2.0-events";
import { decideVerifiedPayment, type LedgerOrder } from "./ledger.js";
import { createMemoryLedger } from "./memory-ledger.js";

function order(overrides: Partial<LedgerOrder> = {}): LedgerOrder {
  return {
    id: "order_1",
    providerId: "official.ecpay",
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
    ...overrides,
  };
}

test("a verified callback records the server amount once", async () => {
  const ledger = createMemoryLedger([order()]);
  assert.deepEqual(
    decideVerifiedPayment(await ledger.getById("order_1"), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "ref_1",
      amountMinor: 500,
    }),
    { action: "record", amountMinor: 500 },
  );
  assert.equal(await ledger.markSucceeded("order_1", "ref_1"), "updated");
  assert.equal(await ledger.markSucceeded("order_1", "ref_1"), "lost_race");
  assert.equal(
    decideVerifiedPayment(await ledger.getById("order_1"), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "ref_1",
      amountMinor: 500,
    }).action,
    "duplicate",
  );
});

test("awaiting keeps one set of instructions and the list can filter it", async () => {
  const ledger = createMemoryLedger([order()]);
  const slip = {
    providerRef: "ref_1",
    bankCode: "812",
    payCode: "9103522175887271",
    barcodes: null,
    expiresAt: "2026-03-15T15:59:59.000Z",
    paymentType: "ATM_TAISHIN",
  };
  assert.equal(await ledger.markAwaiting("order_1", slip), "updated");
  assert.equal(await ledger.markAwaiting("order_1", slip), "duplicate");
  assert.equal(await ledger.markAwaiting("order_1", { ...slip, payCode: "0000000000000001" }), "conflict");
  assert.equal((await ledger.getById("order_1"))?.payCode, "9103522175887271");
  assert.equal((await ledger.listRecent(10, "awaiting")).length, 1);
  assert.equal((await ledger.listRecent(10, "created")).length, 0);
  assert.equal(await ledger.markExpired("order_1"), "updated");
  assert.equal(await ledger.markSucceeded("order_1", "ref_1"), "lost_race");
  assert.equal(
    await ledger.markNeedsReview("order_1", { providerRef: "ref_1", notice: { TradeNo: "ref_1", TradeAmt: "500" } }),
    "updated",
  );
  assert.equal((await ledger.getById("order_1"))?.status, "review");
  assert.equal(
    await ledger.markNeedsReview("order_1", { providerRef: "ref_1", notice: { TradeNo: "other" } }),
    "duplicate",
  );
  assert.equal((await ledger.getById("order_1"))?.reviewNotice?.TradeNo, "ref_1");
});

test("rejects missing, mismatched, and already failed orders", () => {
  assert.equal(
    decideVerifiedPayment(null, { orderId: "missing", providerId: "official.ecpay", providerRef: "r", amountMinor: 500 })
      .action,
    "missing_order",
  );
  assert.equal(
    decideVerifiedPayment(order(), {
      orderId: "order_1",
      providerId: "official.opay",
      providerRef: "r",
      amountMinor: 500,
    }).action,
    "provider_mismatch",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "failed" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "r",
      amountMinor: 500,
    }).action,
    "already_failed",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "succeeded", providerRef: "other" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "r",
      amountMinor: 500,
    }).action,
    "provider_mismatch",
  );
  assert.equal(
    decideVerifiedPayment(order(), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "r",
      amountMinor: 1,
    }).action,
    "amount_mismatch",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "expired", providerRef: "ref_1" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "ref_1",
      amountMinor: 500,
    }).action,
    "needs_review",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "review", providerRef: "ref_1" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "ref_1",
      amountMinor: 500,
    }).action,
    "duplicate",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "awaiting", providerRef: "ref_1" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "other",
      amountMinor: 500,
    }).action,
    "provider_mismatch",
  );
});
