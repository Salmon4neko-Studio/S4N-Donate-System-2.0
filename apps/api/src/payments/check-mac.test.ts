import assert from "node:assert/strict";
import { test } from "node:test";
import { aioCheckMacValue, aioMacEqual, formatTaipeiTimestamp, verifyAioQuery } from "@s4n/plugin-sdk/aio";

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

test("CheckMacValue matches the published CVS payment-info notice", () => {
  const fields = {
    Barcode1: "",
    Barcode2: "",
    Barcode3: "",
    ExpireDate: "2017/12/28 00:39:03",
    MerchantID: "2000132",
    MerchantTradeNo: "Test1513787899",
    PaymentNo: "LLL17355880822",
    PaymentType: "CVS_CVS",
    RtnCode: "10100073",
    RtnMsg: "Get CVS Code Succeeded.",
    TradeAmt: "2000",
    TradeDate: "2017/12/21 00:39:03",
    TradeNo: "17122100383415923452",
    StoreID: "",
    CustomField1: "",
    CustomField2: "",
    CustomField3: "",
    CustomField4: "",
  };
  assert.equal(
    aioCheckMacValue(fields, "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS"),
    "C25373CE6379BB6116FAE8398F4A8E60B71B289D955F6B8A9D9F53FDCC97F571",
  );
});

test("URL encoding follows the provider .NET rules for space, tilde, and apostrophe", () => {
  // Encoded input is hashkey%3d…%26itemname%3da+b%7ec%27d%26… (space -> +, ~ -> %7e, ' -> %27).
  const mac = aioCheckMacValue(
    { ItemName: "A B~c'd", MerchantID: "2000132", TotalAmount: "30" },
    "5294y06JbISpM5x9",
    "v77hoKGq4kWxNNIS",
  );
  assert.equal(mac, "D438650D8F7823823BBC775D66DB02BD25746920E9454C38004B52D9A73B7A29");
});

test("CheckMacValue comparison is exact and does not treat different lengths as equal", () => {
  const mac = aioCheckMacValue(exampleFields, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs");
  assert.equal(aioMacEqual(mac, mac), true);
  assert.equal(aioMacEqual(mac, mac.slice(0, -1) + (mac.endsWith("0") ? "1" : "0")), false);
  assert.equal(aioMacEqual(mac, mac.slice(0, -1)), false);
  assert.equal(aioMacEqual("short", "other"), false);
});

test("a live stage not-found query verifies and is not a payment", () => {
  const raw =
    "HandlingCharge=0&ItemName=&MerchantID=2000132&MerchantTradeNo=aabbccddeeff00112233&PaymentDate=&PaymentType=&PaymentTypeChargeFee=0&TradeAmt=0&TradeDate=&TradeNo=&TradeStatus=10200047&CheckMacValue=0E6700438E96D1280FE9FE9E9FC075CA617A2C8BB1B17A53CE668492607FD4DB";
  const result = verifyAioQuery(
    raw,
    { secrets: { merchantId: "2000132", hashKey: "5294y06JbISpM5x9", hashIv: "v77hoKGq4kWxNNIS" }, settings: { environment: "stage" } },
    {
      stage: {
        checkout: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
        query: "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
      },
      production: {
        checkout: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
        query: "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
      },
    },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.tradeStatus, "failed");
    assert.equal(result.orderId, "aabbccddeeff00112233");
    assert.equal(result.amountMinor, 0);
  }
});

test("merchant trade timestamps use Asia/Taipei", () => {
  assert.equal(formatTaipeiTimestamp(new Date("2023-03-12T07:30:23.000Z")), "2023/03/12 15:30:23");
  assert.equal(formatTaipeiTimestamp(new Date("2023-03-12T16:00:00.000Z")), "2023/03/13 00:00:00");
});
