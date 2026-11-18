import type { CoreBus, DeliveredEvent } from "./bus.js";

const BATCH = 100;
const EXTRA_SCANS = 20;

/**
 * Matching events with sequence greater than `after`, oldest first, at most `limit`.
 * `truncated` means a later matching event was left in the log.
 */
export async function collectReplay(
  bus: CoreBus,
  after: bigint,
  limit: number,
  match: (event: DeliveredEvent) => boolean,
): Promise<{ events: DeliveredEvent[]; truncated: boolean }> {
  const events: DeliveredEvent[] = [];
  let cursor = after;
  while (events.length < limit) {
    const batch = await bus.readAfter(cursor, BATCH);
    if (batch.length === 0) return { events, truncated: false };
    for (const event of batch) {
      cursor = BigInt(event.sequence);
      if (!match(event)) continue;
      events.push(event);
      if (events.length === limit) break;
    }
    if (events.length === limit) break;
    if (batch.length < BATCH) return { events, truncated: false };
  }

  let look = cursor;
  for (let scan = 0; scan < EXTRA_SCANS; scan += 1) {
    const batch = await bus.readAfter(look, BATCH);
    if (batch.length === 0) return { events, truncated: false };
    for (const event of batch) {
      look = BigInt(event.sequence);
      if (match(event)) return { events, truncated: true };
    }
    if (batch.length < BATCH) return { events, truncated: false };
  }
  return { events, truncated: true };
}

const MAX_SEQUENCE = 9223372036854775807n;

/** `null` means "no cursor": live tail, do not replay history. */
export function parseSince(value: string | undefined): bigint | null {
  if (value === undefined || value === "") return null;
  if (!/^\d{1,19}$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > MAX_SEQUENCE) return null;
    return parsed;
  } catch {
    return null;
  }
}
