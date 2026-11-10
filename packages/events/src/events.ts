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

export interface ChatMessagePayload {
  messageId: string;
  platform: "twitch" | "youtube";
  channelId: string;
  /** Untrusted. Chat connectors are not part of this skeleton. */
  authorName: UntrustedText;
  /** Untrusted. Do not render as HTML. */
  text: UntrustedText;
  sentAt: string;
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

export interface S4nEventMap {
  "s4n.donation.created": DonationCreatedPayload;
  "s4n.donation.succeeded": DonationSucceededPayload;
  "s4n.donation.failed": DonationFailedPayload;
  "s4n.chat.message": ChatMessagePayload;
  "s4n.goal.updated": GoalUpdatedPayload;
  "s4n.tts.request": TtsRequestPayload;
  "s4n.media.now_playing": MediaNowPlayingPayload;
}

export type S4nEventName = keyof S4nEventMap;

export type PluginEmittableEventName = Exclude<S4nEventName, CorePaymentEventName>;

export interface S4nEvent<T extends S4nEventName = S4nEventName> {
  type: T;
  id: string;
  occurredAt: string;
  payload: S4nEventMap[T];
}

export type AnyS4nEvent = {
  [T in S4nEventName]: S4nEvent<T>;
}[S4nEventName];
