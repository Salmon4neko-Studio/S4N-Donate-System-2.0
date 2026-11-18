import type { EventStore } from "./event-store.js";

/** Chat is noisy. Donations, goals, and the rest use the longer default. */
export const CHAT_EVENT_TYPES = ["s4n.chat.message", "s4n.chat.delete", "s4n.chat.clear"] as const;

/** Marketplace audit stays after donation and chat retention. */
export const AUDIT_EVENT_TYPES = ["s4n.plugin.changed"] as const;

export interface RetentionPolicy {
  chatMs: number;
  defaultMs: number;
}

export async function purgeExpired(
  store: EventStore,
  policy: RetentionPolicy,
  now = new Date(),
): Promise<{ chat: number; other: number }> {
  const chat = await store.purge({
    olderThan: new Date(now.getTime() - policy.chatMs),
    types: CHAT_EVENT_TYPES,
  });
  const other = await store.purge({
    olderThan: new Date(now.getTime() - policy.defaultMs),
    excludeTypes: [...CHAT_EVENT_TYPES, ...AUDIT_EVENT_TYPES],
  });
  return { chat, other };
}

/** Runs once, then on the interval. The timer does not keep the process alive. */
export function startEventRetention(store: EventStore, policy: RetentionPolicy, intervalMs: number): () => void {
  const run = () => {
    void purgeExpired(store, policy).catch(() => undefined);
  };
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  run();
  return () => clearInterval(timer);
}
