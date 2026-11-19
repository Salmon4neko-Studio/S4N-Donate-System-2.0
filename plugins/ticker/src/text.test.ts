import assert from "node:assert/strict";
import { test } from "node:test";
import { TICKER_ITEM_MAX, TICKER_LINE_MAX, buildTickerLine, parseTickerSettings, plainTickerText, tickerCustomItems } from "./text.js";

const donation = {
  donorName: "小滿",
  amountMinor: 520,
  currency: "TWD",
  message: "謝謝你",
};

test("ticker text is plain, strips hidden characters, and limits length", () => {
  const hostile = "<b>嗨</b>\u0000\u0007\u202E\u200B\uFEFF";
  assert.equal(plainTickerText(hostile, 40), "<b>嗨</b>");
  assert.equal(plainTickerText("一二三四五", 4), "一二三四");
  assert.equal(tickerCustomItems("第一則\n\n第二\u0000則\n   ").join("|"), "第一則|第二則");
  const long = "字".repeat(TICKER_ITEM_MAX + 30);
  assert.equal(tickerCustomItems(long)[0]?.length, TICKER_ITEM_MAX);
});

test("custom lines and recent donations stay in one plain string", () => {
  const line = buildTickerLine(
    { items: "歡迎\n來玩", includeDonations: true, donationCount: 2, includeMessage: false },
    [
      donation,
      { donorName: "阿\u202E明", amountMinor: 100, currency: "TWD", message: "<script>" },
      { donorName: "多的", amountMinor: 1, currency: "TWD", message: "不該出現" },
    ],
  );
  assert.equal(line, "歡迎 · 來玩 · 小滿 NT$520 · 阿明 NT$100");
  assert.equal(line.includes("<script>"), false);
  assert.equal(line.includes("\u202E"), false);
});

test("a message is optional and an empty ticker stays empty", () => {
  const withMessage = buildTickerLine({ items: "", includeDonations: true, includeMessage: true, donationCount: 1 }, [donation]);
  assert.equal(withMessage, "小滿 NT$520 謝謝你");
  const none = buildTickerLine({ items: "   \n", includeDonations: false }, [donation]);
  assert.equal(none, "");
  const capped = buildTickerLine({ items: "句".repeat(TICKER_LINE_MAX + 20), includeDonations: false }, []);
  assert.equal(capped.length <= TICKER_LINE_MAX, true);
});

test("invalid ticker settings fall back", () => {
  const parsed = parseTickerSettings({ speed: "fast", direction: "up", donationCount: 0, textColor: "#abc" });
  assert.equal(parsed.speed, 8);
  assert.equal(parsed.direction, "left");
  assert.equal(parsed.donationCount, 5);
  assert.equal(parsed.includeDonations, true);
  assert.equal(parsed.textColor, "#aabbcc");
});
