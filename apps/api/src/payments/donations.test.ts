import assert from "node:assert/strict";
import { test } from "node:test";
import { planDonation, validateDonationRequest } from "./plan.js";
import { createTestApp } from "../test/fixture.js";

test("donation creation stops at the unimplemented provider and does not write the ledger", async () => {
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

  const rejected = await app.request("/api/donations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pluginId: "official.ecpay",
      amountMinor: 100,
      currency: "TWD",
      donorName: "小光",
      message: "謝謝",
    }),
  });
  assert.equal(rejected.status, 403);

  const response = await app.request("/api/donations", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:5180",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      pluginId: "official.ecpay",
      amountMinor: 100,
      currency: "TWD",
      donorName: "小光",
      message: "這則留言不該被回聲",
    }),
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 501);
  assert.equal(body.error, "payment_not_implemented");
  assert.equal(JSON.stringify(body).includes("這則留言不該被回聲"), false);
  assert.equal(touched, false);
});

test("invalid donations are refused before a provider is planned", () => {
  const invalid = validateDonationRequest({
    pluginId: "official.ecpay",
    amountMinor: 0,
    currency: "USD",
    donorName: "",
    message: "",
  });
  assert.equal(invalid.ok, false);

  const valid = validateDonationRequest({
    pluginId: "official.opay",
    amountMinor: 300,
    currency: "TWD",
    donorName: " 小光 ",
    message: "嗨",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    const planned = planDonation("order_fixed", valid.value);
    assert.equal(planned.amountMinor, 300);
    assert.equal(planned.providerId, "official.opay");
    assert.equal(planned.donorName, "小光");
    assert.equal(planned.status, "created");
  }
});
