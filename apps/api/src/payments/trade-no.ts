import { randomBytes } from "node:crypto";

/** 20-character alphanumeric id. ECPay and O'Pay cap MerchantTradeNo at 20. */
export function createTradeNo(): string {
  return randomBytes(10).toString("hex");
}

export function isTradeNo(value: string): boolean {
  return /^[a-f0-9]{20}$/.test(value);
}
