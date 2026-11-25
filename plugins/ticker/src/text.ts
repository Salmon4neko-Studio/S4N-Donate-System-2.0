import { isHexColor, normalizeHexColor } from "s4n-donate-system-2.0-plugin-sdk";

/** Control characters, bidi overrides, and zero-width characters. */
const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF\u2060]/g;

export const TICKER_ITEM_MAX = 80;
export const TICKER_LINE_MAX = 500;
export const TICKER_DIRECTIONS = ["left", "right"] as const;
export type TickerDirection = (typeof TICKER_DIRECTIONS)[number];

export interface TickerAppearance {
  items: string;
  includeDonations: boolean;
  donationCount: number;
  includeMessage: boolean;
  /** Approximate characters per second. Larger is faster. */
  speed: number;
  direction: TickerDirection;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface TickerDonation {
  donorName: string;
  amountMinor: number;
  currency: string;
  message: string;
}

export const DEFAULT_TICKER: TickerAppearance = {
  items: "歡迎來贊助",
  includeDonations: true,
  donationCount: 5,
  includeMessage: false,
  speed: 8,
  direction: "left",
  textColor: "#1a1512",
  primaryColor: "#f28500",
  secondaryColor: "#ffd7a8",
};

/** Plain text. Tags stay as characters. Hidden characters are removed. */
export function plainTickerText(value: string, max: number): string {
  return value.replace(HIDDEN, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseTickerSettings(settings: Record<string, unknown>): TickerAppearance {
  return {
    items: typeof settings.items === "string" ? settings.items.slice(0, 2000) : DEFAULT_TICKER.items,
    includeDonations: typeof settings.includeDonations === "boolean" ? settings.includeDonations : true,
    donationCount: readInt(settings.donationCount, 5, 1, 20),
    includeMessage: settings.includeMessage === true,
    speed: readInt(settings.speed, 8, 1, 40),
    direction: settings.direction === "right" ? "right" : "left",
    textColor: readColor(settings.textColor, DEFAULT_TICKER.textColor),
    primaryColor: readColor(settings.primaryColor, DEFAULT_TICKER.primaryColor),
    secondaryColor: readColor(settings.secondaryColor, DEFAULT_TICKER.secondaryColor),
  };
}

export function tickerCustomItems(items: string): string[] {
  const lines: string[] = [];
  for (const line of items.split(/\r?\n/)) {
    const text = plainTickerText(line, TICKER_ITEM_MAX);
    if (text !== "") lines.push(text);
  }
  return lines;
}

export function tickerDonationItem(donation: TickerDonation, includeMessage: boolean): string {
  const name = plainTickerText(donation.donorName, 40);
  const who = name === "" ? "匿名" : name;
  const amount = formatTickerAmount(donation.amountMinor, donation.currency);
  const message = includeMessage ? plainTickerText(donation.message, 40) : "";
  const text = message === "" ? `${who} ${amount}` : `${who} ${amount} ${message}`;
  return plainTickerText(text, TICKER_ITEM_MAX);
}

/**
 * One plain-text line. Custom items come first, then the newest paid donations.
 * The result never contains hidden characters and is capped at `TICKER_LINE_MAX`.
 */
export function buildTickerLine(settings: Record<string, unknown>, donations: readonly TickerDonation[]): string {
  const appearance = parseTickerSettings(settings);
  const parts = tickerCustomItems(appearance.items);
  if (appearance.includeDonations) {
    const count = appearance.donationCount;
    for (const donation of donations.slice(0, count)) {
      const item = tickerDonationItem(donation, appearance.includeMessage);
      if (item !== "") parts.push(item);
    }
  }
  return clipLine(parts.join(" · "));
}

/** Seconds for one half-loop. Longer text moves at the same characters per second. */
export function tickerDurationSec(text: string, speed: number): number {
  const pace = readInt(speed, 8, 1, 40);
  const length = Math.max(plainTickerText(text, TICKER_LINE_MAX).length, 8);
  return Math.max(6, Math.round(length / pace));
}

function clipLine(value: string): string {
  const clean = plainTickerText(value, 10_000);
  if (clean.length <= TICKER_LINE_MAX) return clean;
  return clean.slice(0, TICKER_LINE_MAX).trimEnd();
}

function formatTickerAmount(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return "";
  const amount = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amountMinor);
  if (currency === "TWD") return `NT$${amount}`;
  const code = plainTickerText(currency, 8);
  return code === "" ? amount : `${amount} ${code}`;
}

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function readColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !isHexColor(value)) return fallback;
  return normalizeHexColor(value) ?? fallback;
}
