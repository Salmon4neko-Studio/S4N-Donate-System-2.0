import assert from "node:assert/strict";
import { test } from "node:test";
import { isHexColor, normalizeHexColor } from "@s4n/plugin-sdk";
import { readDonationAlert } from "./alert.js";
import {
  ALERT_BODY_MAX,
  ALERT_TITLE_MAX,
  alertExitHoldMs,
  formatAlertAmount,
  parseAlertAppearance,
  renderAlertCopy,
  renderAlertTemplate,
} from "./appearance.js";

const values = {
  name: "小滿",
  amount: "NT$520",
  message: "謝謝",
  currency: "TWD",
};

test("known template variables are replaced once and unknown tokens stay", () => {
  assert.equal(renderAlertTemplate("{name} 贊助了 {amount}", values, 80), "小滿 贊助了 NT$520");
  assert.equal(renderAlertTemplate("留言：{message}（{currency}）", values, 80), "留言：謝謝（TWD）");
  assert.equal(renderAlertTemplate("{playlist} {Name} {name}", values, 80), "{playlist} {Name} 小滿");
  assert.equal(renderAlertTemplate("{123} {name }", values, 40), "{123} {name }");
  assert.equal(renderAlertTemplate("{name}", { name: "{message}" }, 40), "{message}");
});

test("template output is plain text with hidden characters removed and a length cap", () => {
  const hostile = "<script>alert(1)</script>\u0000\u202E{name}";
  assert.equal(renderAlertTemplate(hostile, values, 80), "<script>alert(1)</script>小滿");
  assert.equal(renderAlertTemplate("{name}", { name: "甲\u0007乙<img>" }, 80), "甲乙<img>");
  assert.equal(renderAlertTemplate("一二三四五", {}, 4), "一二三四");
  assert.equal(renderAlertTemplate("{message}", { message: "" }, ALERT_BODY_MAX), "");
  const long = renderAlertTemplate("{name}{message}", { name: "名", message: "文".repeat(200) }, ALERT_TITLE_MAX);
  assert.equal(long.length, ALERT_TITLE_MAX);
  assert.equal(long.startsWith("名文"), true);
});

test("amount formatting and a donation alert stay plain text", () => {
  assert.equal(formatAlertAmount(520, "TWD"), "NT$520");
  assert.equal(formatAlertAmount(1200, "USD"), "1,200 USD");
  const alert = readDonationAlert({
    type: "s4n.donation.test",
    id: "e1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: {
      donationId: "t",
      providerId: "s4n.test",
      amountMinor: 520,
      currency: "TWD",
      donorName: "小滿<script>",
      message: "嗨\u202E",
      test: true,
    },
  } as Parameters<typeof readDonationAlert>[0]);
  assert.ok(alert);
  const copy = renderAlertCopy(alert, parseAlertAppearance({}));
  assert.equal(copy.title, "小滿<script> 贊助了 NT$520");
  assert.equal(copy.body, "嗨");
});

test("missing or invalid appearance fields fall back and legal colors normalize", () => {
  const legacy = parseAlertAppearance({ durationMs: 4000 });
  assert.equal(legacy.durationMs, 4000);
  assert.equal(legacy.titleTemplate, "{name} 贊助了 {amount}");
  assert.equal(legacy.bodyTemplate, "{message}");
  assert.equal(legacy.enterAnimation, "rise");
  assert.equal(legacy.exitAnimation, "fade");
  assert.equal(legacy.primaryColor, "#f28500");

  const custom = parseAlertAppearance({
    titleTemplate: "感謝 {name}",
    bodyTemplate: "{message}",
    titleColor: "#ABC",
    bodyColor: "red",
    primaryColor: "#F28500",
    secondaryColor: "#ffff",
    enterAnimation: "bounce",
    exitAnimation: "slide-left",
    durationMs: 500,
  });
  assert.equal(custom.titleTemplate, "感謝 {name}");
  assert.equal(custom.titleColor, "#aabbcc");
  assert.equal(custom.bodyColor, "#6b5e56");
  assert.equal(custom.primaryColor, "#f28500");
  assert.equal(custom.secondaryColor, "#fbf8f3");
  assert.equal(custom.enterAnimation, "bounce");
  assert.equal(custom.exitAnimation, "slide-left");
  assert.equal(custom.durationMs, 12_000);
});

test("hex colors accept #RGB and #RRGGBB only", () => {
  assert.equal(isHexColor("#F28500"), true);
  assert.equal(isHexColor("#fff"), true);
  assert.equal(isHexColor("#FFF"), true);
  assert.equal(normalizeHexColor("#abc"), "#aabbcc");
  for (const bad of ["F28500", "#F2850", "#F2850G", "#ffff", "#ffffffff", "rgb(0,0,0)", "#f28500 ", ""]) {
    assert.equal(isHexColor(bad), false, bad);
    assert.equal(normalizeHexColor(bad), null, bad);
  }
});

test("reduced motion skips the exit hold", () => {
  assert.equal(alertExitHoldMs(false) > 0, true);
  assert.equal(alertExitHoldMs(true), 0);
});
