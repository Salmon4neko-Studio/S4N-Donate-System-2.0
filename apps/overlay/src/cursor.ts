import { acceptEventId, nextCursor } from "@s4n/events";

const CAP = 500;

export function readCursor(pluginId: string): string | null {
  try {
    const value = localStorage.getItem(cursorKey(pluginId));
    if (value === null || !/^\d{1,19}$/.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeCursor(pluginId: string, sequence: string): void {
  try {
    localStorage.setItem(cursorKey(pluginId), sequence);
  } catch {
    // The page still keeps the cursor in memory when storage is blocked.
  }
}

export function readSeen(pluginId: string): string[] {
  try {
    const raw = localStorage.getItem(seenKey(pluginId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(-CAP);
  } catch {
    return [];
  }
}

export function writeSeen(pluginId: string, seen: readonly string[]): void {
  try {
    localStorage.setItem(seenKey(pluginId), JSON.stringify(seen.slice(-CAP)));
  } catch {
    // Same as the cursor.
  }
}

export function noteEvent(pluginId: string, seen: readonly string[], id: string, sequence: string | null, cursor: string | null): {
  fresh: boolean;
  seen: string[];
  cursor: string | null;
} {
  const decision = acceptEventId(seen, id, CAP);
  const next = sequence === null ? cursor : nextCursor(cursor, sequence);
  if (decision.fresh) writeSeen(pluginId, decision.seen);
  if (next !== null && next !== cursor) writeCursor(pluginId, next);
  return { fresh: decision.fresh, seen: decision.seen, cursor: next };
}

function cursorKey(pluginId: string): string {
  return `s4n.overlay.cursor.v1.${pluginId}`;
}

function seenKey(pluginId: string): string {
  return `s4n.overlay.seen.v1.${pluginId}`;
}
