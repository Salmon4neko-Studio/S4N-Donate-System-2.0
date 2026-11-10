import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText } from "@s4n/events";
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
    }).action,
    "duplicate",
  );
});

test("rejects missing, mismatched, and already failed orders", () => {
  assert.equal(
    decideVerifiedPayment(null, { orderId: "missing", providerId: "official.ecpay", providerRef: "r" })
      .action,
    "missing_order",
  );
  assert.equal(
    decideVerifiedPayment(order(), {
      orderId: "order_1",
      providerId: "official.opay",
      providerRef: "r",
    }).action,
    "provider_mismatch",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "failed" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "r",
    }).action,
    "already_failed",
  );
  assert.equal(
    decideVerifiedPayment(order({ status: "succeeded", providerRef: "other" }), {
      orderId: "order_1",
      providerId: "official.ecpay",
      providerRef: "r",
    }).action,
    "provider_mismatch",
  );
});
