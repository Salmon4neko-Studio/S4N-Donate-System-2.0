import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnyS4nEvent } from "@s4n/events";
import { readDonationAlert } from "@s4n/plugin-alerts";
import { createMemoryLedger } from "./memory-ledger.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

test("a test donation is marked as a test and does not touch the paid ledger", { timeout: 120_000 }, async () => {
  const inner = createMemoryLedger();
  let reads = 0;
  let writes = 0;
  const { app, bus } = createTestApp({
    ledger: {
      async create(order) {
        writes += 1;
        return inner.create(order);
      },
      async getById(id) {
        reads += 1;
        return inner.getById(id);
      },
      async markSucceeded(id, providerRef) {
        writes += 1;
        return inner.markSucceeded(id, providerRef);
      },
      async markFailed(id, providerRef) {
        writes += 1;
        return inner.markFailed(id, providerRef);
      },
      async markAwaiting(id, slip) {
        writes += 1;
        return inner.markAwaiting(id, slip);
      },
      async markExpired(id) {
        writes += 1;
        return inner.markExpired(id);
      },
      async listDue(now, limit) {
        reads += 1;
        return inner.listDue(now, limit);
      },
      async listRecent(limit, status) {
        return inner.listRecent(limit, status);
      },
    },
  });
  const cookie = await setupOperator(app);
  const events: AnyS4nEvent[] = [];
  bus.subscribe((event) => events.push(event));

  const anonymous = await app.request("/api/donations/test", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ amountMinor: 100, donorName: "小光", message: "嗨" }),
  });
  assert.equal(anonymous.status, 401);

  const response = await app.request("/api/donations/test", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({
      amountMinor: 100,
      donorName: "<script>alert(1)</script>",
      message: "你好<img src=x onerror=alert(1)>",
    }),
  });
  const body = (await response.json()) as { test?: boolean; eventId?: string };
  const encoded = JSON.stringify(body);
  assert.equal(response.status, 200);
  assert.equal(body.test, true);
  assert.equal(typeof body.eventId, "string");
  assert.equal(encoded.includes("<script>"), false);
  assert.equal(encoded.includes("你好"), false);
  assert.equal(encoded.includes("onerror"), false);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "s4n.donation.test");
  if (events[0]?.type === "s4n.donation.test") {
    assert.equal(events[0].payload.test, true);
    assert.equal(events[0].payload.providerId, "s4n.test");
    assert.equal(events[0].payload.currency, "TWD");
    assert.equal(events[0].payload.donorName, "<script>alert(1)</script>");
    const alert = readDonationAlert(events[0]);
    assert.equal(alert?.test, true);
    assert.equal(alert?.donorName, "<script>alert(1)</script>");
    assert.equal(alert?.message.includes("onerror"), true);
  }

  const list = await app.request("/api/donations", { headers: { cookie } });
  const listed = (await list.json()) as { donations?: unknown[] };
  assert.equal(list.status, 200);
  assert.deepEqual(listed.donations, []);
  assert.equal((await inner.listRecent(10)).length, 0);
  const stored = await bus.readAfter(0n, 10);
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.type, "s4n.donation.test");
  assert.equal(stored[0]?.id, body.eventId);
});
