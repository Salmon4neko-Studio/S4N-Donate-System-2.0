import { createHash, timingSafeEqual } from "node:crypto";
import { PaymentConfigError, type CallbackVerification, type CreatePaymentInput, type CreatePaymentResult, type PaymentProvider, type ProviderMaterial, type QueryTradeResult, type RawCallback } from "./payments.js";

/**
 * CheckMacValue for ECPay and O'Pay all-in-one checkout (EncryptType=1, SHA-256).
 *
 * Steps match the providers' current AIO appendix:
 * https://developers.ecpay.com.tw/2902/
 * https://developers.opay.tw/AioAll/CreateOrder
 * 1. Sort parameter names A to Z, case-insensitive, and join as key=value with &.
 * 2. Wrap with HashKey=…& and &HashIV=….
 * 3. URL-encode the whole string to the providers' .NET encoding, then lowercase it.
 * 4. SHA-256, then uppercase hex.
 * CheckMacValue itself is never part of the input.
 */
const AIO_ACK = { accepted: "1|OK", rejected: "0|Error" } as const;

export interface AioEndpoints {
  readonly stage: { readonly checkout: string; readonly query: string };
  readonly production: { readonly checkout: string; readonly query: string };
}

export function aioCheckMacValue(
  fields: Readonly<Record<string, string>>,
  hashKey: string,
  hashIv: string,
): string {
  const keys = Object.keys(fields)
    .filter((key) => key !== "CheckMacValue")
    .sort(compareFieldNames);
  const joined = keys.map((key) => `${key}=${fields[key] ?? ""}`).join("&");
  const encoded = aioEncode(`HashKey=${hashKey}&${joined}&HashIV=${hashIv}`);
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/** Constant-time string compare. Different lengths never match. */
export function aioMacEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function formatTaipeiTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}/${pick("month")}/${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
}

export function parseAioForm(rawBody: string): Record<string, string> | null {
  if (rawBody.length === 0 || rawBody.length > 20_000 || rawBody.includes("\0")) return null;
  const params = new URLSearchParams(rawBody);
  const fields: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) return null;
    if (Object.prototype.hasOwnProperty.call(fields, key)) return null;
    if (value.length > 500) return null;
    fields[key] = value;
  }
  if (Object.keys(fields).length === 0) return null;
  return fields;
}

export function verifyAioNotification(
  rawBody: string,
  material: ProviderMaterial,
  endpoints: AioEndpoints,
): CallbackVerification {
  const config = readConfig(material, endpoints);
  const fields = parseAioForm(rawBody);
  if (config === null || fields === null) return { ok: false, reason: "malformed" };

  const expected = aioCheckMacValue(fields, config.hashKey, config.hashIv);
  const provided = fields.CheckMacValue ?? "";
  const comparable = /^[A-Fa-f0-9]{64}$/.test(provided) ? provided.toUpperCase() : "0".repeat(64);
  const macOk = aioMacEqual(expected, comparable) && /^[A-Fa-f0-9]{64}$/.test(provided);
  const merchantOk = aioMacEqual(config.merchantId, fields.MerchantID ?? "");
  if (!macOk || !merchantOk) return { ok: false, reason: "invalid_signature" };

  const orderId = fields.MerchantTradeNo ?? "";
  if (!/^[A-Za-z0-9]{1,20}$/.test(orderId)) return { ok: false, reason: "malformed" };
  const amountMinor = canonicalAmount(fields.TradeAmt);
  if (amountMinor === null) return { ok: false, reason: "malformed" };
  const tradeNo = fields.TradeNo ?? "";
  if (tradeNo !== "" && !/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) return { ok: false, reason: "malformed" };

  const paid = fields.RtnCode === "1";
  const simulated = fields.SimulatePaid === "1";
  if (paid && simulated && config.environment === "production") {
    return { ok: true, orderId, providerRef: tradeNo, amountMinor, outcome: "simulated" };
  }
  if (paid) {
    if (tradeNo === "") return { ok: false, reason: "malformed" };
    return { ok: true, orderId, providerRef: tradeNo, amountMinor, outcome: "paid" };
  }
  return { ok: true, orderId, providerRef: tradeNo, amountMinor, outcome: "failed" };
}

export function verifyAioQuery(rawBody: string, material: ProviderMaterial, endpoints: AioEndpoints): QueryTradeResult {
  const config = readConfig(material, endpoints);
  const fields = parseAioForm(rawBody);
  if (config === null || fields === null) return { ok: false, reason: "malformed" };

  const expected = aioCheckMacValue(fields, config.hashKey, config.hashIv);
  const provided = fields.CheckMacValue ?? "";
  const comparable = /^[A-Fa-f0-9]{64}$/.test(provided) ? provided.toUpperCase() : "0".repeat(64);
  const macOk = aioMacEqual(expected, comparable) && /^[A-Fa-f0-9]{64}$/.test(provided);
  const merchantOk = aioMacEqual(config.merchantId, fields.MerchantID ?? "");
  if (!macOk || !merchantOk) return { ok: false, reason: "invalid_signature" };

  const orderId = fields.MerchantTradeNo ?? "";
  if (!/^[A-Za-z0-9]{1,20}$/.test(orderId)) return { ok: false, reason: "malformed" };
  const amountMinor = canonicalAmount(fields.TradeAmt);
  if (amountMinor === null) return { ok: false, reason: "malformed" };
  const tradeNo = fields.TradeNo ?? "";
  if (tradeNo !== "" && !/^[A-Za-z0-9]{1,40}$/.test(tradeNo)) return { ok: false, reason: "malformed" };

  const status = fields.TradeStatus;
  if (status === "1") {
    if (tradeNo === "") return { ok: false, reason: "malformed" };
    return { ok: true, orderId, providerRef: tradeNo, amountMinor, tradeStatus: "paid" };
  }
  if (status === "0") return { ok: true, orderId, providerRef: tradeNo, amountMinor, tradeStatus: "unpaid" };
  if (status === "10200095") return { ok: true, orderId, providerRef: tradeNo, amountMinor, tradeStatus: "failed" };
  return { ok: false, reason: "malformed" };
}

export function buildAioCheckout(
  input: CreatePaymentInput,
  material: ProviderMaterial,
  endpoints: AioEndpoints,
  now: Date,
): CreatePaymentResult {
  const config = readConfig(material, endpoints);
  if (config === null) throw new PaymentConfigError();
  if (input.currency !== "TWD" || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new PaymentConfigError();
  }
  if (!/^[A-Za-z0-9]{1,20}$/.test(input.orderId)) throw new PaymentConfigError();
  assertHttpUrl(input.callbackUrl, 200);
  assertHttpUrl(input.returnUrl, 200);
  assertHttpUrl(input.clientBackUrl, 200);

  const fields: Record<string, string> = {
    ChoosePayment: "Credit",
    ClientBackURL: input.clientBackUrl,
    EncryptType: "1",
    ItemName: "贊助",
    MerchantID: config.merchantId,
    MerchantTradeDate: formatTaipeiTimestamp(now),
    MerchantTradeNo: input.orderId,
    OrderResultURL: input.returnUrl,
    PaymentType: "aio",
    ReturnURL: input.callbackUrl,
    TotalAmount: String(input.amountMinor),
    TradeDesc: "直播贊助",
  };
  fields.CheckMacValue = aioCheckMacValue(fields, config.hashKey, config.hashIv);
  return { form: { action: config.checkoutUrl, fields } };
}

export function buildAioTradeQuery(
  orderId: string,
  material: ProviderMaterial,
  endpoints: AioEndpoints,
  now: Date,
): { action: string; fields: Record<string, string> } | null {
  const config = readConfig(material, endpoints);
  if (config === null || !/^[A-Za-z0-9]{1,20}$/.test(orderId)) return null;
  const fields: Record<string, string> = {
    MerchantID: config.merchantId,
    MerchantTradeNo: orderId,
    TimeStamp: String(Math.floor(now.getTime() / 1000)),
  };
  fields.CheckMacValue = aioCheckMacValue(fields, config.hashKey, config.hashIv);
  return { action: config.queryUrl, fields };
}

export function createAioProvider(options: {
  pluginId: string;
  endpoints: AioEndpoints;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}): PaymentProvider {
  assertEndpoint(options.endpoints.stage.checkout);
  assertEndpoint(options.endpoints.stage.query);
  assertEndpoint(options.endpoints.production.checkout);
  assertEndpoint(options.endpoints.production.query);
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    pluginId: options.pluginId,
    notifyBody: AIO_ACK,
    async createPayment(input, material) {
      return buildAioCheckout(input, material, options.endpoints, now());
    },
    async verifyCallback(input: RawCallback, material) {
      return verifyAioNotification(input.rawBody, material, options.endpoints);
    },
    async queryTrade(input, material) {
      const built = buildAioTradeQuery(input.orderId, material, options.endpoints, now());
      if (built === null) return { ok: false, reason: "malformed" };
      let raw = "";
      try {
        const body = new URLSearchParams(built.fields);
        const response = await fetchImpl(built.action, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        raw = await response.text();
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      if (raw.length > 64_000) return { ok: false, reason: "malformed" };
      return verifyAioQuery(raw, material, options.endpoints);
    },
  };
}

function compareFieldNames(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a < b) return -1;
  if (a > b) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function aioEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/~/g, "%7E")
    .replace(/'/g, "%27")
    .toLowerCase()
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

function canonicalAmount(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000) return null;
  return amount;
}

function isKeyMaterial(value: string): boolean {
  return value.length >= 8 && value.length <= 64 && /^[\x21-\x7E]+$/.test(value);
}

function readConfig(material: ProviderMaterial, endpoints: AioEndpoints) {
  const merchantId = material.secrets.merchantId ?? "";
  const hashKey = material.secrets.hashKey ?? "";
  const hashIv = material.secrets.hashIv ?? "";
  const environment = material.settings.environment;
  if (!/^[A-Za-z0-9]{1,10}$/.test(merchantId)) return null;
  if (!isKeyMaterial(hashKey) || !isKeyMaterial(hashIv)) return null;
  if (environment !== "stage" && environment !== "production") return null;
  const endpoint = endpoints[environment];
  return {
    merchantId,
    hashKey,
    hashIv,
    environment,
    checkoutUrl: endpoint.checkout,
    queryUrl: endpoint.query,
  };
}

function assertHttpUrl(value: string, max: number): void {
  if (value.length < 8 || value.length > max) throw new PaymentConfigError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PaymentConfigError();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PaymentConfigError();
}

function assertEndpoint(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("invalid payment endpoint");
  }
}
