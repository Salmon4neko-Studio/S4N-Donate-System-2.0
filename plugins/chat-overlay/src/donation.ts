import { asUntrustedText, type ChatMessagePayload, type DonationSucceededPayload, type DonationTestPayload } from "@s4n/events";
import { visiblePlain } from "./filter.js";

type DonationLike = DonationSucceededPayload | DonationTestPayload;

/** Turns a donation event into a chat line. Does not write the ledger. */
export function donationAsChatMessage(event: DonationLike, timestamp: string): ChatMessagePayload {
  const message = visiblePlain(event.message, 200);
  const name = visiblePlain(event.donorName, 40);
  const test = "test" in event && event.test === true;
  const payload: ChatMessagePayload = {
    platform: "s4n",
    channel: "donation",
    userId: event.donationId,
    login: "",
    displayName: asUntrustedText(name.length > 0 ? name : "匿名"),
    color: null,
    badges: [],
    fragments: message.length === 0 ? [] : [{ type: "text", text: asUntrustedText(message) }],
    text: asUntrustedText(message),
    timestamp,
    messageId: `donation.${safeId(event.donationId)}`,
    flags: { isMod: false, isBroadcaster: false, isSubscriber: false, isVip: false },
    donation: {
      donationId: event.donationId,
      amountMinor: event.amountMinor,
      currency: event.currency,
      test,
    },
  };
  return payload;
}

function safeId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 60);
  return cleaned.length > 0 ? cleaned : "donation";
}
