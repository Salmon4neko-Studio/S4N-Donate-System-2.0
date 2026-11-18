const SEQUENCE = /^\d{1,19}$/;
const MAX_SEQUENCE = 9223372036854775807n;

/**
 * At-least-once delivery dedupe. `fresh` is false when this id was already accepted.
 * The returned list keeps the newest ids, capped so a long overlay session stays small.
 */
export function acceptEventId(
  seen: readonly string[],
  id: string,
  cap = 500,
): { fresh: boolean; seen: string[] } {
  if (id.length === 0 || seen.includes(id)) return { fresh: false, seen: [...seen] };
  const room = cap > 0 ? cap : 1;
  const next = seen.length >= room ? [...seen.slice(seen.length - room + 1), id] : [...seen, id];
  return { fresh: true, seen: next };
}

/** Keep the greater decimal sequence. Invalid input leaves the current cursor alone. */
export function nextCursor(current: string | null, sequence: string): string | null {
  if (!SEQUENCE.test(sequence)) return current;
  let incoming: bigint;
  try {
    incoming = BigInt(sequence);
  } catch {
    return current;
  }
  if (incoming < 0n || incoming > MAX_SEQUENCE) return current;
  if (current === null || !SEQUENCE.test(current)) return sequence;
  let held: bigint;
  try {
    held = BigInt(current);
  } catch {
    return sequence;
  }
  return incoming > held ? sequence : current;
}
