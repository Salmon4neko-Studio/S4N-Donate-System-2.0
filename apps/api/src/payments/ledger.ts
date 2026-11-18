import type { UntrustedText } from "@s4n/events";

export type DonationState = "created" | "awaiting" | "succeeded" | "expired" | "failed";

export interface LedgerOrder {
  id: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  status: DonationState;
  providerRef: string | null;
  donorName: UntrustedText;
  message: UntrustedText;
  /** When an unpaid order may be expired. Null until the core assigns one. */
  expiresAt: string | null;
  bankCode: string | null;
  payCode: string | null;
  barcodes: readonly [string, string, string] | null;
  paymentType: string | null;
}

export interface AwaitSlip {
  providerRef: string;
  bankCode: string | null;
  payCode: string | null;
  barcodes: readonly [string, string, string] | null;
  expiresAt: string;
  paymentType: string;
}

export type LedgerDecision =
  | { action: "record"; amountMinor: number }
  | { action: "duplicate" }
  | { action: "missing_order" }
  | { action: "provider_mismatch" }
  | { action: "already_failed" }
  | { action: "amount_mismatch" };

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
  expiresAt: string | null;
  bankCode: string | null;
  payCode: string | null;
  barcodes: readonly [string, string, string] | null;
}

export interface Ledger {
  create(order: LedgerOrder): Promise<void>;
  getById(id: string): Promise<LedgerOrder | null>;
  /**
   * Conditional write from 待付款, 待繳費, or 已過期.
   * A verified payment after local expiry still books: the bank may have accepted it.
   * `lost_race` means the row was no longer one of those states.
   */
  markSucceeded(id: string, providerRef: string): Promise<"updated" | "lost_race">;
  /** Conditional write from 待付款 or 待繳費. */
  markFailed(id: string, providerRef: string | null): Promise<"updated" | "lost_race">;
  /**
   * 待付款 -> 待繳費. A second notice with the same instructions is `duplicate`.
   * A different account or code for the same order is `conflict` and is not stored.
   */
  markAwaiting(id: string, slip: AwaitSlip): Promise<"updated" | "duplicate" | "conflict" | "lost_race">;
  /** Conditional write from 待付款 or 待繳費. */
  markExpired(id: string): Promise<"updated" | "lost_race">;
  /** Unpaid orders whose deadline has passed. Oldest deadline first. */
  listDue(now: Date, limit: number): Promise<LedgerOrder[]>;
  /** Newest first. Does not create rows. `status` limits the list when set. */
  listRecent(limit: number, status?: DonationState): Promise<ListedDonation[]>;
}

/**
 * Amounts booked always come from the stored order. `amountMinor` is the
 * amount the provider signed; a mismatch is rejected and not booked.
 */
export function decideVerifiedPayment(
  order: LedgerOrder | null,
  input: { orderId: string; providerId: string; providerRef: string; amountMinor: number },
): LedgerDecision {
  if (order === null || order.id !== input.orderId) return { action: "missing_order" };
  if (order.providerId !== input.providerId) return { action: "provider_mismatch" };
  if (order.amountMinor !== input.amountMinor) return { action: "amount_mismatch" };
  if (order.providerRef !== null && order.providerRef !== input.providerRef) {
    return { action: "provider_mismatch" };
  }
  if (order.status === "succeeded") return { action: "duplicate" };
  if (order.status === "failed") return { action: "already_failed" };
  return { action: "record", amountMinor: order.amountMinor };
}

export function sameAwaitSlip(order: LedgerOrder, slip: AwaitSlip): boolean {
  return (
    order.providerRef === slip.providerRef &&
    order.bankCode === slip.bankCode &&
    order.payCode === slip.payCode &&
    order.paymentType === slip.paymentType &&
    order.expiresAt === slip.expiresAt &&
    barcodeKey(order.barcodes) === barcodeKey(slip.barcodes)
  );
}

function barcodeKey(codes: readonly [string, string, string] | null): string {
  return codes === null ? "" : codes.join("\n");
}
