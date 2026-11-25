import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText } from "s4n-donate-system-2.0-events";
import { createMemoryLedger } from "../payments/memory-ledger.js";
import type { LedgerOrder } from "../payments/ledger.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";
import { decorateOverlaySettings, forgetRetiredGoalSetting, publishGoalProgress } from "./overlay-state.js";
import { createMemorySecretStore } from "../plugins/memory-store.js";

function order(id: string, amount: number, status: LedgerOrder["status"]): LedgerOrder {
  return {
    id,
    providerId: "official.ecpay",
    amountMinor: amount,
    currency: "TWD",
    status,
    providerRef: status === "succeeded" ? "ref" : null,
    donorName: asUntrustedText(id === "paid" ? "小滿\u202E" : "待處理"),
    message: asUntrustedText("謝謝\u0000你"),
    expiresAt: null,
    bankCode: null,
    payCode: null,
    barcodes: null,
    paymentType: null,
    reviewNotice: null,
  };
}

test("goal progress and the ticker line come from the paid ledger", async () => {
  const ledger = createMemoryLedger([
    order("paid", 300, "succeeded"),
    order("late", 80, "review"),
    order("open", 40, "created"),
  ]);
  const credited = await decorateOverlaySettings("official.goals", { targetMinor: 1000, creditedOnly: false }, ledger);
  assert.equal(credited.currentMinor, 300);
  assert.equal("creditedOnly" in credited, false);
  const wider = await decorateOverlaySettings("official.goals", { creditedOnly: false, since: "2099-01-01T00:00:00.000Z" }, ledger);
  assert.equal(wider.currentMinor, 0);
  const ticker = await decorateOverlaySettings(
    "official.ticker",
    { items: "歡迎\u0007", includeDonations: true, includeMessage: true, donationCount: 5 },
    ledger,
  );
  assert.equal(ticker.marquee, "歡迎 · 小滿 NT$300 謝謝你");
  assert.equal(String(ticker.marquee).includes("\u202E"), false);
  assert.equal(String(ticker.marquee).includes("\u0000"), false);
});

test("a booked donation publishes the goal total on the existing bus", async () => {
  const fixture = createTestApp();
  const cookie = await setupOperator(fixture.app);
  await fixture.installations.setEnabled("official.goals", true, "0.1.0");
  await fixture.secrets.write("official.goals", {
    version: "0.1.0",
    publicSettings: { title: "新麥克風", targetMinor: 500, creditedOnly: true },
    secrets: {},
  });
  await fixture.ledger.create({
    id: "order_goal",
    providerId: "official.ecpay",
    amountMinor: 120,
    currency: "TWD",
    status: "created",
    providerRef: null,
    donorName: asUntrustedText("小滿"),
    message: asUntrustedText(""),
    expiresAt: null,
    bankCode: null,
    payCode: null,
    barcodes: null,
    paymentType: null,
    reviewNotice: null,
  });
  await fixture.ledger.markSucceeded("order_goal", "ref-1");
  await publishGoalProgress(fixture);
  const events = await fixture.bus.readRecent(5);
  const goal = events.find((event) => event.type === "s4n.goal.updated");
  assert.ok(goal);
  if (goal?.type !== "s4n.goal.updated") return;
  assert.equal(goal.payload.currentMinor, 120);
  assert.equal(goal.payload.targetMinor, 500);
  assert.equal(goal.payload.title, "新麥克風");

  const secrets = createMemorySecretStore();
  await secrets.write("official.goals", {
    version: "0.1.0",
    publicSettings: { title: "舊目標", creditedOnly: false, targetMinor: 1000 },
    secrets: {},
  });
  await forgetRetiredGoalSetting(secrets, "0.1.1");
  const kept = await secrets.readPublicSettings("official.goals");
  assert.equal(kept.title, "舊目標");
  assert.equal(kept.targetMinor, 1000);
  assert.equal("creditedOnly" in kept, false);
  await forgetRetiredGoalSetting(secrets, "0.1.1");

  const saved = await fixture.app.request("/api/plugins/official.goals/settings", {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ values: { targetMinor: 0 } }),
  });
  assert.equal(saved.status, 422);
});
