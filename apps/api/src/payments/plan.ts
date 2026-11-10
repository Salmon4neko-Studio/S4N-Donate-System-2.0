import { asUntrustedText } from "@s4n/events";
import type { LedgerOrder } from "./ledger.js";

const AMOUNT_MAX = 10_000_000;
const NAME_MAX = 40;
const MESSAGE_MAX = 200;

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
): { ok: true; value: DonationRequest } | { ok: false; issues: string[] } {
  if (!isRecord(value)) return { ok: false, issues: ["invalid_body"] };
  const issues: string[] = [];

  const pluginId = typeof value.pluginId === "string" ? value.pluginId : "";
  if (pluginId === "") issues.push("plugin_required");

  if (!isAmount(value.amountMinor)) issues.push("amount_invalid");
  if (value.currency !== "TWD") issues.push("currency_not_supported");

  const donorName = typeof value.donorName === "string" ? value.donorName.trim() : "";
  if (donorName.length < 1 || donorName.length > NAME_MAX) issues.push("donor_name_invalid");

  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (typeof value.message !== "string" || message.length > MESSAGE_MAX) issues.push("message_invalid");

  if (issues.length > 0 || !isAmount(value.amountMinor)) {
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
  };
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= AMOUNT_MAX;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
