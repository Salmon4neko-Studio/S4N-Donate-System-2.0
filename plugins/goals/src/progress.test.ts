import assert from "node:assert/strict";
import { test } from "node:test";
import { goalAchieved, goalPercent, parseGoalSettings, sumGoalProgress, type GoalRow } from "./progress.js";

const paid = (amount: number, updatedAt: string, status = "succeeded", currency = "TWD"): GoalRow => ({
  status,
  amountMinor: amount,
  currency,
  updatedAt,
});

test("a goal sums booked donations and skips review and every unpaid state", () => {
  const rows = [
    paid(100, "2026-11-01T00:00:00.000Z"),
    paid(40, "2026-11-02T00:00:00.000Z", "awaiting"),
    paid(15, "2026-11-02T00:00:00.000Z", "created"),
    paid(7, "2026-11-02T00:00:00.000Z", "failed"),
    paid(9, "2026-11-02T00:00:00.000Z", "expired"),
    paid(30, "2026-11-03T00:00:00.000Z", "review"),
    paid(500, "2026-11-04T00:00:00.000Z", "succeeded", "USD"),
  ];
  assert.equal(sumGoalProgress(rows, { since: null }), 100);
});

test("the start time drops donations booked before it", () => {
  const rows = [
    paid(200, "2026-11-01T00:00:00.000Z"),
    paid(50, "2026-11-19T08:00:00.000Z"),
    paid(25, "2026-11-19T08:00:00.000Z", "review"),
  ];
  const since = "2026-11-19T00:00:00.000Z";
  assert.equal(sumGoalProgress(rows, { since }), 50);
  assert.equal(sumGoalProgress(rows, { since: "not-a-date" }), 250);
});

test("a stored creditedOnly flag does not change the total", () => {
  const rows = [paid(100, "2026-11-01T00:00:00.000Z"), paid(30, "2026-11-03T00:00:00.000Z", "review")];
  const parsed = parseGoalSettings({ creditedOnly: false, title: "本月目標" });
  assert.equal("creditedOnly" in parsed, false);
  assert.equal(sumGoalProgress(rows, parsed), 100);
  assert.equal(parseGoalSettings({}).title, "本月目標");
  assert.equal(parsed.targetMinor, 1000);
  assert.equal(parsed.since, null);
  assert.equal(parsed.primaryColor, "#f28500");
});

test("goal text drops hidden characters and the bar caps at 100 percent", () => {
  const parsed = parseGoalSettings({
    title: "新麥\u0000克風\u202E",
    targetMinor: 100,
    since: "2026-11-19T01:02:03.000Z",
    creditedOnly: false,
    textColor: "#ABC",
    primaryColor: "orange",
  });
  assert.equal(parsed.title, "新麥克風");
  assert.equal(parsed.since, "2026-11-19T01:02:03.000Z");
  assert.equal("creditedOnly" in parsed, false);
  assert.equal(parsed.textColor, "#aabbcc");
  assert.equal(parsed.primaryColor, "#f28500");
  assert.equal(goalPercent(40, 100), 40);
  assert.equal(goalPercent(250, 100), 100);
  assert.equal(goalPercent(0, 100), 0);
  assert.equal(goalAchieved(100, 100), true);
  assert.equal(goalAchieved(99, 100), false);
});
