import { DEFAULT_BOT_NAMES } from "./manifest.js";

export interface ChatOverlaySettings {
  lifetimeSeconds: number;
  maxLines: number;
  hideBots: boolean;
  botNames: string;
  hideCommands: boolean;
  keywords: string;
  syncModeration: boolean;
  mixDonations: boolean;
}

export function parseChatOverlaySettings(raw: Record<string, unknown>): ChatOverlaySettings {
  return {
    lifetimeSeconds: intSetting(raw.lifetimeSeconds, 0, 0, 86_400),
    maxLines: intSetting(raw.maxLines, 12, 1, 200),
    hideBots: boolSetting(raw.hideBots, true),
    botNames: stringSetting(raw.botNames, DEFAULT_BOT_NAMES, 2_000),
    hideCommands: boolSetting(raw.hideCommands, true),
    keywords: stringSetting(raw.keywords, "", 2_000),
    syncModeration: boolSetting(raw.syncModeration, true),
    mixDonations: boolSetting(raw.mixDonations, false),
  };
}

export function splitList(raw: string, limit = 50): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(/[\n,，]/)) {
    const trimmed = part.trim();
    if (trimmed.length === 0 || trimmed.length > 40) continue;
    const key = trimmed.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
    if (names.length >= limit) break;
  }
  return names;
}

function intSetting(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function boolSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function stringSetting(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max);
}
