import { asUntrustedText, type ChatMessagePayload } from "s4n-donate-system-2.0-events";
import { visiblePlain } from "./filter.js";

/** Global Twitch CDN images used only so a preview can show badges without Helix. */
export const PREVIEW_BROADCASTER_BADGE =
  "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3";
export const PREVIEW_MODERATOR_BADGE =
  "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3";
const PREVIEW_KAPPA = "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0";

/**
 * A local preview line. It is not read from Twitch and it is not written to the ledger.
 * The Kappa emote and the two badges let the overlay be checked without a live channel.
 */
export function previewChatMessage(input: {
  displayName: string;
  text: string;
  now: string;
  messageId: string;
}): ChatMessagePayload {
  const name = visiblePlain(input.displayName, 40);
  const text = visiblePlain(input.text, 180);
  const spoken = text.length > 0 ? text : "大家好";
  const displayName = name.length > 0 ? name : "測試觀眾";
  return {
    platform: "twitch",
    channel: "preview",
    userId: "preview",
    login: "preview",
    displayName: asUntrustedText(displayName),
    color: "#f28500",
    badges: [
      {
        setId: "broadcaster",
        version: "1",
        title: asUntrustedText("實況主"),
        imageUrl: PREVIEW_BROADCASTER_BADGE,
      },
      {
        setId: "moderator",
        version: "1",
        title: asUntrustedText("管理員"),
        imageUrl: PREVIEW_MODERATOR_BADGE,
      },
    ],
    fragments: [
      { type: "text", text: asUntrustedText(`${spoken} `) },
      { type: "emote", id: "25", name: asUntrustedText("Kappa"), imageUrl: PREVIEW_KAPPA },
    ],
    text: asUntrustedText(`${spoken} Kappa`),
    timestamp: input.now,
    messageId: input.messageId,
    flags: { isMod: true, isBroadcaster: true, isSubscriber: false, isVip: false },
  };
}
