import { createHash, timingSafeEqual } from "node:crypto";
import {
  PaymentConfigError,
  type CallbackVerification,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentInfoVerification,
  type PaymentProvider,
  type ProviderMaterial,
  type QueryTradeResult,
  type RawCallback,
} from "./payments.js";

/**
 * CheckMacValue for ECPay and O'Pay all-in-one checkout (EncryptType=1, SHA-256).
 *
 * Steps match the providers' current AIO appendix:
 * https://developers.ecpay.com.tw/2902/
 * https://developers.opay.tw/AioAll/CreateOrder
 * 1. Sort parameter names A to Z, case-insensitive, and join as key=value with &.
 * 2. Wrap with HashKey=…& and &HashIV=….
 * 3. URL-encode the whole string the way PHP urlencode / .NET does, then lowercase it.
 *    Space becomes +. ~ becomes %7e. ' becomes %27.
 *    - _ . ! * ( ) are restored to themselves after encoding.
 * 4. SHA-256, then uppercase hex.
 * CheckMacValue itself is never part of the input.
 */
const AIO_ACK = { accepted: "1|OK", rejected: "0|Error" } as const;

/** ATM virtual account stays payable for this many calendar days (provider default). */
const ATM_EXPIRE_DAYS = 3;
/** CVS payment-slip print window, in minutes (provider default, 7 days). */
const CVS_EXPIRE_MINUTES = 10_080;
/** BARCODE payment window, in calendar days (provider default). */
const BARCODE_EXPIRE_DAYS = 7;
/** Abandoned credit checkout. The provider has no virtual-account deadline. */
const CREDIT_HOLD_MS = 24 * 60 * 60 * 1000;

export type AioChoosePayment = "Credit" | "ATM" | "CVS" | "BARCODE";

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
  const parts = taipeiParts(date);
  return `${parts.year}/${pad(parts.month)}/${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/** Unpaid-order deadline the core may expire, before a provider notice replaces it. */
export function aioProvisionalExpiry(method: AioChoosePayment, now: Date): string {
  if (method === "Credit") return new Date(now.getTime() + CREDIT_HOLD_MS).toISOString();
  if (method === "CVS") return new Date(now.getTime() + CVS_EXPIRE_MINUTES * 60 * 1000).toISOString();
  if (method === "ATM") return taipeiDayEnd(now, ATM_EXPIRE_DAYS);
  return taipeiDayEnd(now, BARCODE_EXPIRE_DAYS);
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
  choosePayment: AioChoosePayment = "Credit",
): CallbackVerification {
  const config = readConfig(material, endpoints);
  const fields = parseAioForm(rawBody);
  if (config === null || fields === null) return { ok: false, reason: "malformed" };
  if (!signedByMerchant(fields, config.hashKey, config.hashIv, config.merchantId)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const orderId = readOrderId(fields.MerchantTradeNo);
  const amountMinor = canonicalAmount(fields.TradeAmt);
  if (orderId === null || amountMinor === null) return { ok: false, reason: "malformed" };
  const tradeNo = fields.TradeNo ?? "";
  if (tradeNo !== "" && !/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) return { ok: false, reason: "malformed" };

  // PaymentInfoURL success codes are not payment results. Do not fail the order.
  if (fields.RtnCode === "2" || fields.RtnCode === "10100073") return { ok: false, reason: "malformed" };
  if (!paymentTypeMatches(fields.PaymentType, choosePayment)) return { ok: false, reason: "malformed" };

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

export function verifyAioPaymentInfo(
  rawBody: string,
  material: ProviderMaterial,
  endpoints: AioEndpoints,
  choosePayment: AioChoosePayment,
): PaymentInfoVerification {
  if (choosePayment === "Credit") return { ok: false, reason: "not_implemented" };
  const config = readConfig(material, endpoints);
  const fields = parseAioForm(rawBody);
  if (config === null || fields === null) return { ok: false, reason: "malformed" };
  if (!signedByMerchant(fields, config.hashKey, config.hashIv, config.merchantId)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const orderId = readOrderId(fields.MerchantTradeNo);
  const amountMinor = canonicalAmount(fields.TradeAmt);
  if (orderId === null || amountMinor === null) return { ok: false, reason: "malformed" };
  const tradeNo = fields.TradeNo ?? "";
  if (!/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) return { ok: false, reason: "malformed" };
  if (!paymentTypeMatches(fields.PaymentType, choosePayment)) return { ok: false, reason: "malformed" };

  const issuedCode = choosePayment === "ATM" ? "2" : "10100073";
  if (fields.RtnCode !== issuedCode) {
    if (fields.RtnCode === "1" || fields.RtnCode === "2" || fields.RtnCode === "10100073") {
      return { ok: false, reason: "malformed" };
    }
    return { ok: true, outcome: "failed", orderId, providerRef: tradeNo, amountMinor };
  }

  const issued = readIssued(fields, choosePayment);
  if (issued === null) return { ok: false, reason: "malformed" };
  return {
    ok: true,
    outcome: "issued",
    issued: { orderId, providerRef: tradeNo, amountMinor, paymentType: fields.PaymentType ?? "", ...issued },
  };
}

export function verifyAioQuery(rawBody: string, material: ProviderMaterial, endpoints: AioEndpoints): QueryTradeResult {
  const config = readConfig(material, endpoints);
  const fields = parseAioForm(rawBody);
  if (config === null || fields === null) return { ok: false, reason: "malformed" };
  if (!signedByMerchant(fields, config.hashKey, config.hashIv, config.merchantId)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const orderId = readOrderId(fields.MerchantTradeNo);
  if (orderId === null) return { ok: false, reason: "malformed" };
  const tradeNo = fields.TradeNo ?? "";
  if (tradeNo !== "" && !/^[A-Za-z0-9]{1,40}$/.test(tradeNo)) return { ok: false, reason: "malformed" };

  const status = fields.TradeStatus;
  // 10200047: no such trade. 10200095: the consumer never finished creating the order.
  // The signed amount is often 0 because the provider has no order to echo.
  if (status === "10200047" || status === "10200095") {
    return { ok: true, orderId, providerRef: tradeNo, amountMinor: 0, tradeStatus: "failed" };
  }

  const amountMinor = canonicalAmount(fields.TradeAmt);
  if (amountMinor === null) return { ok: false, reason: "malformed" };
  if (status === "1") {
    if (tradeNo === "") return { ok: false, reason: "malformed" };
    return { ok: true, orderId, providerRef: tradeNo, amountMinor, tradeStatus: "paid" };
  }
  if (status === "0") return { ok: true, orderId, providerRef: tradeNo, amountMinor, tradeStatus: "unpaid" };
  return { ok: false, reason: "malformed" };
}

export function buildAioCheckout(
  input: CreatePaymentInput,
  material: ProviderMaterial,
  endpoints: AioEndpoints,
  now: Date,
  choosePayment: AioChoosePayment = "Credit",
): CreatePaymentResult {
  const config = readConfig(material, endpoints);
  if (config === null) throw new PaymentConfigError();
  if (input.currency !== "TWD" || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new PaymentConfigError();
  }
  if (!/^[A-Za-z0-9]{1,20}$/.test(input.orderId)) throw new PaymentConfigError();

  const fields: Record<string, string> = {
    ChoosePayment: choosePayment,
    EncryptType: "1",
    ItemName: "贊助",
    MerchantID: config.merchantId,
    MerchantTradeDate: formatTaipeiTimestamp(now),
    MerchantTradeNo: input.orderId,
    PaymentType: "aio",
    ReturnURL: input.callbackUrl,
    TotalAmount: String(input.amountMinor),
    TradeDesc: "直播贊助",
  };
  assertHttpUrl(input.callbackUrl, 200);

  if (choosePayment === "Credit") {
    assertHttpUrl(input.returnUrl, 200);
    assertHttpUrl(input.clientBackUrl, 200);
    fields.ClientBackURL = input.clientBackUrl;
    fields.OrderResultURL = input.returnUrl;
  } else {
    assertHttpUrl(input.paymentInfoUrl, 200);
    assertHttpUrl(input.clientRedirectUrl, 200);
    fields.PaymentInfoURL = input.paymentInfoUrl;
    fields.ClientRedirectURL = input.clientRedirectUrl;
    if (choosePayment === "ATM") fields.ExpireDate = String(ATM_EXPIRE_DAYS);
    if (choosePayment === "CVS") {
      fields.StoreExpireDate = String(CVS_EXPIRE_MINUTES);
      fields.Desc_1 = "直播贊助";
    }
    if (choosePayment === "BARCODE") fields.StoreExpireDate = String(BARCODE_EXPIRE_DAYS);
  }

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
  choosePayment?: AioChoosePayment;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}): PaymentProvider {
  assertEndpoint(options.endpoints.stage.checkout);
  assertEndpoint(options.endpoints.stage.query);
  assertEndpoint(options.endpoints.production.checkout);
  assertEndpoint(options.endpoints.production.query);
  const choosePayment = options.choosePayment ?? "Credit";
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    pluginId: options.pluginId,
    notifyBody: AIO_ACK,
    provisionalExpiry(at) {
      return aioProvisionalExpiry(choosePayment, at);
    },
    async createPayment(input, material) {
      return buildAioCheckout(input, material, options.endpoints, now(), choosePayment);
    },
    async verifyCallback(input: RawCallback, material) {
      return verifyAioNotification(input.rawBody, material, options.endpoints, choosePayment);
    },
    ...(choosePayment === "Credit"
      ? {}
      : {
          async verifyPaymentInfo(input: RawCallback, material: ProviderMaterial) {
            return verifyAioPaymentInfo(input.rawBody, material, options.endpoints, choosePayment);
          },
        }),
    async queryTrade(input, material) {
      const built = buildAioTradeQuery(input.orderId, material, options.endpoints, now());
      if (built === null) return { ok: false, reason: "malformed" };
      let raw = "";
      try {
        const response = await fetchImpl(built.action, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(built.fields),
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return { ok: false, reason: "unavailable" };
        raw = await response.text();
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      if (raw.length > 64_000) return { ok: false, reason: "malformed" };
      const queried = verifyAioQuery(raw, material, options.endpoints);
      if (queried.ok && queried.orderId !== input.orderId) return { ok: false, reason: "malformed" };
      return queried;
    },
  };
}

interface IssuedFields {
  method: "atm" | "cvs" | "barcode";
  bankCode: string | null;
  payCode: string | null;
  barcodes: readonly [string, string, string] | null;
  expiresAt: string;
}

function readIssued(fields: Readonly<Record<string, string>>, method: Exclude<AioChoosePayment, "Credit">): IssuedFields | null {
  if (method === "ATM") {
    const bankCode = fields.BankCode ?? "";
    const payCode = fields.vAccount ?? "";
    const expiresAt = parseTaipeiDate(fields.ExpireDate ?? "", true);
    if (!/^[0-9]{3}$/.test(bankCode) || !/^[0-9]{8,16}$/.test(payCode) || expiresAt === null) return null;
    return { method: "atm", bankCode, payCode, barcodes: null, expiresAt };
  }
  const expiresAt = parseTaipeiDate(fields.ExpireDate ?? "", false);
  if (expiresAt === null) return null;
  if (method === "CVS") {
    const payCode = fields.PaymentNo ?? "";
    if (!/^[A-Za-z0-9]{1,14}$/.test(payCode)) return null;
    return { method: "cvs", bankCode: null, payCode, barcodes: null, expiresAt };
  }
  const barcodes = [fields.Barcode1 ?? "", fields.Barcode2 ?? "", fields.Barcode3 ?? ""] as const;
  if (barcodes.some((code) => !/^[0-9A-Za-z][0-9A-Za-z+\-.$/ ]{0,39}$/.test(code))) return null;
  return { method: "barcode", bankCode: null, payCode: null, barcodes, expiresAt };
}

function paymentTypeMatches(value: string | undefined, method: AioChoosePayment): boolean {
  if (value === undefined || value.length === 0 || value.length > 20) return false;
  if (method === "Credit") return /^Credit(_|$)/.test(value);
  if (method === "ATM") return /^ATM_/.test(value);
  if (method === "CVS") return /^CVS_/.test(value);
  return /^BARCODE_/.test(value);
}

function signedByMerchant(
  fields: Readonly<Record<string, string>>,
  hashKey: string,
  hashIv: string,
  merchantId: string,
): boolean {
  const expected = aioCheckMacValue(fields, hashKey, hashIv);
  const merchantOk = fixedEqual(merchantId, fields.MerchantID ?? "");
  return macEqual(expected, fields.CheckMacValue ?? "") && merchantOk;
}

/** Compare a SHA-256 hex MAC in constant time. A non-hex value never matches. */
function macEqual(expectedHex: string, provided: string): boolean {
  const hexOk = /^[A-Fa-f0-9]{64}$/.test(provided);
  const rightHex = hexOk ? provided : "0".repeat(64);
  const left = Buffer.from(expectedHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  if (left.length !== 32 || right.length !== 32) return false;
  return timingSafeEqual(left, right) && hexOk;
}

function fixedEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left, "utf8").digest();
  const b = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(a, b);
}

function readOrderId(value: string | undefined): string | null {
  if (value === undefined || !/^[A-Za-z0-9]{1,20}$/.test(value)) return null;
  return value;
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

function taipeiParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
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
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "");
  const hour = pick("hour") === 24 ? 0 : pick("hour");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Last payable instant on the Taipei calendar day `days` after `now` (23:59:59). */
function taipeiDayEnd(now: Date, days: number): string {
  const parts = taipeiParts(now);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 23 - 8, 59, 59));
  return utc.toISOString();
}

function parseTaipeiDate(value: string, dateOnly: boolean): string | null {
  const match = dateOnly
    ? /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value)
    : /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = dateOnly ? 23 : Number(match[4]);
  const minute = dateOnly ? 59 : Number(match[5]);
  const second = dateOnly ? 59 : Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
  if (Number.isNaN(utc.getTime())) return null;
  const back = taipeiParts(utc);
  if (back.year !== year || back.month !== month || back.day !== day) return null;
  if (back.hour !== hour || back.minute !== minute || back.second !== second) return null;
  return utc.toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
