import type { UntrustedText } from "s4n-donate-system-2.0-events";

export type DonationState = "created" | "awaiting" | "succeeded" | "expired" | "failed" | "review";

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
  /** Provider notice kept for 待人工處理. No CheckMacValue and no key material. */
  reviewNotice: Readonly<Record<string, string>> | null;
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
  | { action: "needs_review" }
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
  reviewNotice: Readonly<Record<string, string>> | null;
}

export interface Ledger {
  create(order: LedgerOrder): Promise<void>;
  getById(id: string): Promise<LedgerOrder | null>;
  /** Conditional write from 待付款 or 待繳費. An expired order is not booked here. */
  markSucceeded(id: string, providerRef: string): Promise<"updated" | "lost_race">;
  /**
   * 已過期 -> 待人工處理. Does not book the payment.
   * A second notice is `duplicate` and keeps the first payload.
   */
  markNeedsReview(
    id: string,
    input: { providerRef: string; notice: Readonly<Record<string, string>> },
  ): Promise<"updated" | "duplicate" | "lost_race">;
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
  /**
   * Sum of amounts whose status is in `statuses` and whose last update is at or after `since`.
   * `since` null counts the whole ledger. Currency must match.
   */
  sumPaid(input: { statuses: readonly DonationState[]; since: string | null; currency: string }): Promise<number>;
  /** Booked payments, newest update first. */
  listPaidRecent(limit: number, currency: string): Promise<ListedDonation[]>;
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
  if (order.status === "succeeded" || order.status === "review") return { action: "duplicate" };
  if (order.status === "failed") return { action: "already_failed" };
  if (order.status === "expired") return { action: "needs_review" };
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
