import assert from "node:assert/strict";
import { test } from "node:test";
import { planDonation, validateDonationRequest } from "./plan.js";
import { createTestApp } from "../test/fixture.js";

test("donation creation stops at the unimplemented provider and does not write the ledger", async () => {
  let touched = false;
  const { app } = createTestApp({
    ledger: {
      async create() {
        touched = true;
      },
      async getById() {
        touched = true;
        return null;
      },
      async markSucceeded() {
        touched = true;
        return "lost_race";
      },
      async markNeedsReview() {
        touched = true;
        return "lost_race" as const;
      },
      async markFailed() {
        touched = true;
        return "lost_race";
      },
      async markAwaiting() {
        touched = true;
        return "lost_race" as const;
      },
      async markExpired() {
        touched = true;
        return "lost_race" as const;
      },
      async listDue() {
        touched = true;
        return [];
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
  assert.equal(response.status, 422);
  assert.equal(body.error, "provider_unavailable");
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

  const belowMin = validateDonationRequest(
    {
      pluginId: "official.ecpay",
      amountMinor: 10,
      currency: "TWD",
      donorName: "小光",
      message: "",
    },
    { min: 30, max: 20_000 },
  );
  assert.equal(belowMin.ok, false);

  const control = validateDonationRequest({
    pluginId: "official.ecpay",
    amountMinor: 100,
    currency: "TWD",
    donorName: "小\n光",
    message: "嗨",
  });
  assert.equal(control.ok, false);
});
