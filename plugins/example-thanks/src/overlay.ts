import { acceptEventId, nextCursor, type S4nEvent } from "s4n-donate-system-2.0-events";
import type { PluginBus } from "s4n-donate-system-2.0-plugin-sdk";

export type ThanksEvent = S4nEvent<"s4n.donation.succeeded"> | S4nEvent<"s4n.donation.test">;

/**
 * Subscribe to donation alerts. The core may deliver the same event again
 * after a reconnect (at-least-once). `shouldShow` drops a repeated id and
 * keeps the highest sequence.
 */
export function watchDonations(bus: PluginBus, onAlert: (event: ThanksEvent) => void): () => void {
  const stopPaid = bus.subscribe("s4n.donation.succeeded", onAlert);
  const stopTest = bus.subscribe("s4n.donation.test", onAlert);
  return () => {
    stopPaid();
    stopTest();
  };
}

export function shouldShow(
  seen: readonly string[],
  id: string,
  cursor: string | null,
  sequence: string,
): { show: boolean; seen: string[]; cursor: string | null } {
  const decision = acceptEventId(seen, id);
  return {
    show: decision.fresh,
    seen: decision.seen,
    cursor: nextCursor(cursor, sequence),
  };
}
