import { isHexColor, normalizeHexColor } from "@s4n/plugin-sdk";

const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF\u2060]/g;

export const GOAL_TITLE_MAX = 40;
export const DEFAULT_GOAL_TITLE = "本月目標";
export const DEFAULT_GOAL_TARGET = 1000;

export interface GoalAppearance {
  title: string;
  targetMinor: number;
  /** ISO-8601, or null when every paid donation counts. */
  since: string | null;
  /**
   * True counts only booked payments (`succeeded`).
   * False also counts `review`: a verified notice that was not booked.
   */
  creditedOnly: boolean;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface GoalRow {
  status: string;
  amountMinor: number;
  currency: string;
  /** When the ledger row was last updated. Paying updates this. */
  updatedAt: string;
}

export const DEFAULT_GOAL_APPEARANCE: GoalAppearance = {
  title: DEFAULT_GOAL_TITLE,
  targetMinor: DEFAULT_GOAL_TARGET,
  since: null,
  creditedOnly: true,
  textColor: "#1a1512",
  primaryColor: "#f28500",
  secondaryColor: "#f4efe8",
};

/** Statuses that count toward a goal. Test donations are never ledger rows. */
export function goalStatuses(creditedOnly: boolean): readonly string[] {
  return creditedOnly ? ["succeeded"] : ["succeeded", "review"];
}

export function parseGoalSettings(settings: Record<string, unknown>): GoalAppearance {
  return {
    title: readTitle(settings.title),
    targetMinor: readTarget(settings.targetMinor),
    since: readSince(settings.since),
    creditedOnly: readCreditedOnly(settings.creditedOnly),
    textColor: readColor(settings.textColor, DEFAULT_GOAL_APPEARANCE.textColor),
    primaryColor: readColor(settings.primaryColor, DEFAULT_GOAL_APPEARANCE.primaryColor),
    secondaryColor: readColor(settings.secondaryColor, DEFAULT_GOAL_APPEARANCE.secondaryColor),
  };
}

/**
 * Sum of paid ledger rows. `creditedOnly` keeps 待人工處理 out.
 * Rows before `since` are skipped. Amounts that are not TWD are skipped.
 */
export function sumGoalProgress(rows: readonly GoalRow[], appearance: Pick<GoalAppearance, "creditedOnly" | "since">): number {
  const allowed = new Set(goalStatuses(appearance.creditedOnly));
  const parsedSince = appearance.since === null ? Number.NaN : Date.parse(appearance.since);
  const sinceMs = Number.isNaN(parsedSince) ? null : parsedSince;
  let total = 0;
  for (const row of rows) {
    if (!allowed.has(row.status)) continue;
    if (row.currency !== "TWD") continue;
    if (!Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0) continue;
    if (sinceMs !== null) {
      const updated = Date.parse(row.updatedAt);
      if (Number.isNaN(updated) || updated < sinceMs) continue;
    }
    total += row.amountMinor;
  }
  return total;
}

export function goalPercent(currentMinor: number, targetMinor: number): number {
  if (!Number.isSafeInteger(currentMinor) || currentMinor <= 0) return 0;
  if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0) return 0;
  return Math.min(100, Math.round((currentMinor / targetMinor) * 100));
}

export function goalAchieved(currentMinor: number, targetMinor: number): boolean {
  return targetMinor > 0 && currentMinor >= targetMinor;
}

export function plainGoalText(value: string, max: number): string {
  return value.replace(HIDDEN, "").slice(0, max);
}

function readTitle(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_GOAL_TITLE;
  const text = plainGoalText(value, GOAL_TITLE_MAX).trim();
  return text === "" ? DEFAULT_GOAL_TITLE : text;
}

function readTarget(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10_000_000) {
    return DEFAULT_GOAL_TARGET;
  }
  return value;
}

function readSince(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function readCreditedOnly(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return true;
}

function readColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !isHexColor(value)) return fallback;
  return normalizeHexColor(value) ?? fallback;
}
