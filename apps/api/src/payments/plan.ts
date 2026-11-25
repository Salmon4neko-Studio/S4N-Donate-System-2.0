import { asUntrustedText } from "s4n-donate-system-2.0-events";
import type { LedgerOrder } from "./ledger.js";

const AMOUNT_HARD_MAX = 10_000_000;
const NAME_MAX = 40;
const MESSAGE_MAX = 200;
const CONTROL = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

export interface DonationLimits {
  min: number;
  max: number;
}

export interface DonationRequest {
  pluginId: string;
  amountMinor: number;
  currency: "TWD";
  donorName: string;
  message: string;
}

/**
 * TWD amounts are integer dollars. ECPay and O'Pay charge integer TWD,
 * so one minor unit in this skeleton is NT$1.
 */
export function validateDonationRequest(
  value: unknown,
  limits: DonationLimits = { min: 1, max: AMOUNT_HARD_MAX },
): { ok: true; value: DonationRequest } | { ok: false; issues: string[] } {
  if (!isRecord(value)) return { ok: false, issues: ["invalid_body"] };
  const issues: string[] = [];

  const pluginId = typeof value.pluginId === "string" ? value.pluginId : "";
  if (pluginId === "") issues.push("plugin_required");

  if (!isAmount(value.amountMinor, limits)) issues.push("amount_invalid");
  if (value.currency !== "TWD") issues.push("currency_not_supported");

  const donorName = typeof value.donorName === "string" ? value.donorName.trim() : "";
  if (!isPlainText(donorName, 1, NAME_MAX)) issues.push("donor_name_invalid");

  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (typeof value.message !== "string" || !isPlainText(message, 0, MESSAGE_MAX)) issues.push("message_invalid");

  if (issues.length > 0 || !isAmount(value.amountMinor, limits)) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      pluginId,
      amountMinor: value.amountMinor,
      currency: "TWD",
      donorName,
      message,
    },
  };
}

export function planDonation(id: string, request: DonationRequest): LedgerOrder {
  return {
    id,
    providerId: request.pluginId,
    amountMinor: request.amountMinor,
    currency: request.currency,
    status: "created",
    providerRef: null,
    donorName: asUntrustedText(request.donorName),
    message: asUntrustedText(request.message),
    expiresAt: null,
    bankCode: null,
    payCode: null,
    barcodes: null,
    paymentType: null,
    reviewNotice: null,
  };
}

function isAmount(value: unknown, limits: DonationLimits): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= limits.min &&
    value <= limits.max &&
    value <= AMOUNT_HARD_MAX
  );
}

function isPlainText(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max && !CONTROL.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
