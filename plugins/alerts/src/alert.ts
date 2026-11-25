import type { AnyS4nEvent } from "s4n-donate-system-2.0-events";

const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

export interface DonationAlert {
  id: string;
  donorName: string;
  amountMinor: number;
  currency: string;
  message: string;
  test: boolean;
}

/** Plain text only. Tags stay as characters so a renderer must not parse them as HTML. */
export function visibleUntrusted(value: string, max = 200): string {
  return value.replace(HIDDEN, "").slice(0, max);
}

export function readDonationAlert(event: AnyS4nEvent): DonationAlert | null {
  if (event.type !== "s4n.donation.succeeded" && event.type !== "s4n.donation.test") return null;
  const { donorName, message, amountMinor, currency } = event.payload;
  if (typeof donorName !== "string" || typeof message !== "string" || typeof currency !== "string") return null;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) return null;
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  return {
    id: event.id,
    donorName: visibleUntrusted(donorName, 40),
    amountMinor,
    currency,
    message: visibleUntrusted(message),
    test: event.type === "s4n.donation.test",
  };
}

export function alertDurationMs(settings: Record<string, unknown>, fallback = 12_000): number {
  const value = settings.durationMs;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1000 || value > 120_000) {
    return fallback;
  }
  return value;
}
