import assert from "node:assert/strict";
import { test } from "node:test";
import { aioCheckMacValue, aioMacEqual, formatTaipeiTimestamp } from "@s4n/plugin-sdk/aio";

/**
 * Published AIO example from https://developers.ecpay.com.tw/2902/
 * HashKey/HashIV are also the public 3-D stage merchant on
 * https://developers.ecpay.com.tw/35542/ (MerchantID 3002607).
 */
const exampleFields = {
  TradeDesc: "促銷方案",
  PaymentType: "aio",
  MerchantTradeDate: "2023/03/12 15:30:23",
  MerchantTradeNo: "ecpay20230312153023",
  MerchantID: "3002607",
  ReturnURL: "https://www.ecpay.com.tw/receive.php",
  ItemName: "Apple iphone 15",
  TotalAmount: "30000",
  ChoosePayment: "ALL",
  EncryptType: "1",
};

test("CheckMacValue matches the published ECPay AIO vector", () => {
  const mac = aioCheckMacValue(exampleFields, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs");
  assert.equal(mac, "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840");
  const withMac = { ...exampleFields, CheckMacValue: "ignored" };
  assert.equal(aioCheckMacValue(withMac, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs"), mac);
});

test("CheckMacValue comparison is exact and does not treat different lengths as equal", () => {
  const mac = aioCheckMacValue(exampleFields, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs");
  assert.equal(aioMacEqual(mac, mac), true);
  assert.equal(aioMacEqual(mac, mac.slice(0, -1) + (mac.endsWith("0") ? "1" : "0")), false);
  assert.equal(aioMacEqual(mac, mac.slice(0, -1)), false);
  assert.equal(aioMacEqual("short", "other"), false);
});

test("merchant trade timestamps use Asia/Taipei", () => {
  assert.equal(formatTaipeiTimestamp(new Date("2023-03-12T07:30:23.000Z")), "2023/03/12 15:30:23");
  assert.equal(formatTaipeiTimestamp(new Date("2023-03-12T16:00:00.000Z")), "2023/03/13 00:00:00");
});
