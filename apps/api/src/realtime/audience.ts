import type { AnyS4nEvent } from "@s4n/events";

/** Overlay plugin that may receive this event. Null means no overlay slot. */
export function overlayPluginFor(event: AnyS4nEvent): string | null {
  switch (event.type) {
    case "s4n.donation.created":
    case "s4n.donation.succeeded":
    case "s4n.donation.failed":
    case "s4n.donation.test":
      return "official.alerts";
    case "s4n.goal.updated":
      return "official.goals";
    case "s4n.tts.request":
      return "official.tts";
    case "s4n.chat.message":
    case "s4n.chat.delete":
    case "s4n.chat.clear":
      return "official.chat-overlay";
    case "s4n.media.now_playing":
      return null;
    default: {
      const unexpected: never = event;
      throw new Error(`unexpected event ${JSON.stringify(unexpected)}`);
    }
  }
}

export function shouldForwardToOverlay(
  event: AnyS4nEvent,
  subscribedPluginId: string,
  enabledPluginIds: ReadonlySet<string>,
): boolean {
  const owner = overlayPluginFor(event);
  return owner !== null && owner === subscribedPluginId && enabledPluginIds.has(owner);
}
