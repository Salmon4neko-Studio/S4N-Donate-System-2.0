import type { UntrustedText } from "./untrusted.js";

export const CORE_PAYMENT_EVENTS = [
  "s4n.donation.created",
  "s4n.donation.succeeded",
  "s4n.donation.failed",
] as const;

export type CorePaymentEventName = (typeof CORE_PAYMENT_EVENTS)[number];

export interface DonationCreatedPayload {
  donationId: string;
  providerId: string;
  /** Minor units of the server-side order. Callbacks must not replace this. */
  amountMinor: number;
  currency: string;
  /** Untrusted donor-supplied display name. */
  donorName: UntrustedText;
  /** Untrusted donor-supplied message. */
  message: UntrustedText;
  createdAt: string;
}

export interface DonationSucceededPayload {
  donationId: string;
  providerId: string;
  providerRef: string;
  /** Copied from the server-side order, never from the provider body. */
  amountMinor: number;
  currency: string;
  donorName: UntrustedText;
  message: UntrustedText;
}

export interface DonationFailedPayload {
  donationId: string;
  providerId: string;
  reason: "verification_failed" | "declined" | "expired" | "unknown";
}

/** Dashboard preview. Never written to the paid ledger. */
export interface DonationTestPayload {
  donationId: string;
  providerId: "s4n.test";
  amountMinor: number;
  currency: "TWD";
  donorName: UntrustedText;
  message: UntrustedText;
  test: true;
}

/** A platform connector. `s4n` is reserved for lines the core mixes in, such as donations. */
export type ChatPlatform = "twitch" | "youtube";

export type ChatMessagePlatform = ChatPlatform | "s4n";

export interface ChatBadge {
  /** Badge set id, for example `moderator` or `subscriber`. */
  setId: string;
  version: string;
  /** Untrusted label. Render as text, never as HTML. */
  title: UntrustedText;
  /** HTTPS image on an allowlisted CDN. Omit when the cache has no image. */
  imageUrl?: string;
}

export interface ChatTextFragment {
  type: "text";
  text: UntrustedText;
}

export interface ChatEmoteFragment {
  type: "emote";
  /** Platform emote id. */
  id: string;
  /** Untrusted name as it appeared in the message. */
  name: UntrustedText;
  imageUrl?: string;
}

export type ChatFragment = ChatTextFragment | ChatEmoteFragment;

export interface ChatMessageFlags {
  isMod: boolean;
  isBroadcaster: boolean;
  isSubscriber: boolean;
  isVip: boolean;
}

/** Present only when a donation is mixed into chat. Never a ledger write. */
export interface ChatDonationEmbed {
  donationId: string;
  amountMinor: number;
  currency: string;
  /** True when the source event was `s4n.donation.test`. */
  test: boolean;
}

/**
 * One chat line, independent of the platform connector that produced it.
 * A YouTube source emits this same shape. The display plugin does not import a source.
 */
export interface ChatMessagePayload {
  platform: ChatMessagePlatform;
  /** Login name, without a leading #. */
  channel: string;
  userId: string;
  /** Platform login when it differs from the display name. Empty when unknown. */
  login: string;
  displayName: UntrustedText;
  /** `#RRGGBB`, or null when the platform sent none. */
  color: string | null;
  badges: readonly ChatBadge[];
  fragments: readonly ChatFragment[];
  /** Plain text of the whole line. Untrusted. Do not render as HTML. */
  text: UntrustedText;
  /** ISO-8601 timestamp. */
  timestamp: string;
  messageId: string;
  flags: ChatMessageFlags;
  donation?: ChatDonationEmbed;
}

/** One message was removed (Twitch CLEARMSG, or the equivalent on another platform). */
export interface ChatDeletePayload {
  platform: ChatPlatform;
  channel: string;
  messageId: string;
  userId?: string;
}

/**
 * A ban, a timeout, or a full-channel clear (Twitch CLEARCHAT).
 * Omit `userId` to clear the channel. `durationSeconds` is a timeout length.
 */
export interface ChatClearPayload {
  platform: ChatPlatform;
  channel: string;
  userId?: string;
  durationSeconds?: number;
}

export interface GoalUpdatedPayload {
  goalId: string;
  title: string;
  currentMinor: number;
  targetMinor: number;
  currency: string;
}

export interface TtsRequestPayload {
  requestId: string;
  /** Untrusted. A future speech processor must sanitize before playback. */
  text: UntrustedText;
  voiceId?: string;
}

export interface MediaNowPlayingPayload {
  mediaId: string;
  title: string;
  url?: string;
  /** Untrusted requester name. */
  requestedBy: UntrustedText;
}

export const PLUGIN_CHANGE_ACTIONS = [
  "install",
  "update",
  "uninstall",
  "enable",
  "disable",
  "rollback",
  "pin",
  "unpin",
] as const;

export type PluginChangeAction = (typeof PLUGIN_CHANGE_ACTIONS)[number];

/**
 * Operator audit for the marketplace. Permission names only.
 * Setting values, ciphertext, and signing keys never belong here.
 */
export interface PluginChangedPayload {
  action: PluginChangeAction;
  pluginId: string;
  version: string;
  previousVersion: string | null;
  permissions: string[];
  addedPermissions: string[];
  removedPermissions: string[];
  source: "official" | "community";
  /** Set on uninstall. True keeps settings and sealed secrets. */
  dataKept: boolean | null;
}

export interface S4nEventMap {
  "s4n.donation.created": DonationCreatedPayload;
  "s4n.donation.succeeded": DonationSucceededPayload;
  "s4n.donation.failed": DonationFailedPayload;
  "s4n.donation.test": DonationTestPayload;
  "s4n.chat.message": ChatMessagePayload;
  "s4n.chat.delete": ChatDeletePayload;
  "s4n.chat.clear": ChatClearPayload;
  "s4n.goal.updated": GoalUpdatedPayload;
  "s4n.tts.request": TtsRequestPayload;
  "s4n.media.now_playing": MediaNowPlayingPayload;
  "s4n.plugin.changed": PluginChangedPayload;
}

export type S4nEventName = keyof S4nEventMap;

export type PluginEmittableEventName = Exclude<
  S4nEventName,
  CorePaymentEventName | "s4n.donation.test" | "s4n.plugin.changed"
>;

export interface S4nEvent<T extends S4nEventName = S4nEventName> {
  type: T;
  id: string;
  occurredAt: string;
  payload: S4nEventMap[T];
}

export type AnyS4nEvent = {
  [T in S4nEventName]: S4nEvent<T>;
}[S4nEventName];
