import type { UntrustedText } from "@s4n/events";

export interface LedgerOrder {
  id: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  status: "created" | "succeeded" | "failed";
  providerRef: string | null;
  donorName: UntrustedText;
  message: UntrustedText;
}

export type LedgerDecision =
  | { action: "record"; amountMinor: number }
  | { action: "duplicate" }
  | { action: "missing_order" }
  | { action: "provider_mismatch" }
  | { action: "already_failed" };

export interface ListedDonation {
  id: string;
  providerId: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
  status: LedgerOrder["status"];
  donorName: string;
  message: string;
  createdAt: string;
}

export interface Ledger {
  getById(id: string): Promise<LedgerOrder | null>;
  /** Conditional write. `lost_race` means the row was no longer `created`. */
  markSucceeded(id: string, providerRef: string): Promise<"updated" | "lost_race">;
  /** Newest first. Does not create rows. */
  listRecent(limit: number): Promise<ListedDonation[]>;
}

/**
 * Amounts always come from the stored order. The callback verification
 * type has no amount field, so a plugin cannot supply one.
 */
export function decideVerifiedPayment(
  order: LedgerOrder | null,
  input: { orderId: string; providerId: string; providerRef: string },
): LedgerDecision {
  if (order === null || order.id !== input.orderId) return { action: "missing_order" };
  if (order.providerId !== input.providerId) return { action: "provider_mismatch" };
  if (order.status === "succeeded") {
    return order.providerRef === input.providerRef
      ? { action: "duplicate" }
      : { action: "provider_mismatch" };
  }
  if (order.status === "failed") return { action: "already_failed" };
  return { action: "record", amountMinor: order.amountMinor };
}
