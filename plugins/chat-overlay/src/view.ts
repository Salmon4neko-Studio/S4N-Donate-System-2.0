import {
  asUntrustedText,
  type ChatClearPayload,
  type ChatDeletePayload,
  type ChatFragment,
  type ChatMessagePayload,
} from "@s4n/events";
import { maskFragments, shouldHideChatMessage, visiblePlain } from "./filter.js";
import { splitList, type ChatOverlaySettings } from "./settings.js";

export interface ChatLineBadge {
  title: string;
  imageUrl: string | null;
}

export interface ChatLinePartText {
  type: "text";
  text: string;
}

export interface ChatLinePartEmote {
  type: "emote";
  name: string;
  imageUrl: string | null;
}

export type ChatLinePart = ChatLinePartText | ChatLinePartEmote;

export interface ChatLineView {
  messageId: string;
  userId: string;
  platform: ChatMessagePayload["platform"];
  login: string;
  displayName: string;
  nameColor: string;
  badges: ChatLineBadge[];
  parts: ChatLinePart[];
  timestamp: number;
  donation: { amountMinor: number; currency: string; test: boolean } | null;
}

export type ChatWireEvent =
  | { type: "s4n.chat.message"; payload: ChatMessagePayload }
  | { type: "s4n.chat.delete"; payload: ChatDeletePayload }
  | { type: "s4n.chat.clear"; payload: ChatClearPayload };

const INK = "#241c18";
const ORANGE_INK = "#995400";
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

export function safeChatImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "static-cdn.jtvnw.net") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.toString();
}

export function readableNameColor(color: string | null): string {
  if (color === null || !/^#[0-9a-f]{6}$/.test(color)) return ORANGE_INK;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  if (luminance > 0.72) return INK;
  return color;
}

export function presentChatMessage(payload: ChatMessagePayload, settings: ChatOverlaySettings): ChatLineView | null {
  if (shouldHideChatMessage(payload, settings)) return null;
  const keywords = splitList(settings.keywords);
  const parts = toParts(maskFragments(payload.fragments, keywords));
  if (parts.length === 0 && payload.donation === undefined) return null;
  const timestamp = Date.parse(payload.timestamp);
  const line: ChatLineView = {
    messageId: payload.messageId,
    userId: payload.userId,
    platform: payload.platform,
    login: payload.login,
    displayName: visiblePlain(payload.displayName, 50),
    nameColor: readableNameColor(payload.color),
    badges: payload.badges.slice(0, 16).map((badge) => ({
      title: visiblePlain(badge.title, 40),
      imageUrl: safeChatImageUrl(badge.imageUrl),
    })),
    parts,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    donation: null,
  };
  if (payload.donation !== undefined) {
    line.donation = {
      amountMinor: payload.donation.amountMinor,
      currency: payload.donation.currency,
      test: payload.donation.test,
    };
  }
  return line;
}

export function reduceChatLines(
  lines: readonly ChatLineView[],
  event: ChatWireEvent,
  settings: ChatOverlaySettings,
  now: number,
): ChatLineView[] {
  const live = expireChatLines(lines, settings, now);
  if (event.type === "s4n.chat.delete") {
    if (!settings.syncModeration) return live;
    return live.filter((line) => line.messageId !== event.payload.messageId);
  }
  if (event.type === "s4n.chat.clear") {
    if (!settings.syncModeration) return live;
    const userId = event.payload.userId;
    if (userId === undefined || userId === "") return [];
    return live.filter((line) => line.userId !== userId);
  }
  const line = presentChatMessage(event.payload, settings);
  if (line === null) return live;
  if (live.some((item) => item.messageId === line.messageId)) return live;
  return capLines([...live, line], settings.maxLines);
}

export function expireChatLines(
  lines: readonly ChatLineView[],
  settings: ChatOverlaySettings,
  now: number,
): ChatLineView[] {
  if (settings.lifetimeSeconds <= 0) return [...lines];
  const cutoff = now - settings.lifetimeSeconds * 1000;
  return lines.filter((line) => line.timestamp >= cutoff);
}

export function capLines(lines: readonly ChatLineView[], maxLines: number): ChatLineView[] {
  if (lines.length <= maxLines) return [...lines];
  return lines.slice(lines.length - maxLines);
}

export function readChatWireEvent(value: unknown): ChatWireEvent | null {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.payload)) return null;
  if (value.type === "s4n.chat.message") {
    const payload = readMessage(value.payload);
    return payload === null ? null : { type: "s4n.chat.message", payload };
  }
  if (value.type === "s4n.chat.delete") {
    const payload = readDelete(value.payload);
    return payload === null ? null : { type: "s4n.chat.delete", payload };
  }
  if (value.type === "s4n.chat.clear") {
    const payload = readClear(value.payload);
    return payload === null ? null : { type: "s4n.chat.clear", payload };
  }
  return null;
}

function toParts(fragments: readonly ChatFragment[]): ChatLinePart[] {
  const parts: ChatLinePart[] = [];
  for (const fragment of fragments) {
    if (fragment.type === "text") {
      const text = visiblePlain(fragment.text, 500);
      if (text.length === 0) continue;
      parts.push({ type: "text", text });
      continue;
    }
    const name = visiblePlain(fragment.name, 50);
    if (name.length === 0) continue;
    parts.push({ type: "emote", name, imageUrl: safeChatImageUrl(fragment.imageUrl) });
  }
  return parts.slice(0, 40);
}

function readMessage(value: Record<string, unknown>): ChatMessagePayload | null {
  const platform = value.platform;
  if (platform !== "twitch" && platform !== "youtube" && platform !== "s4n") return null;
  if (typeof value.channel !== "string" || !/^[a-z0-9_]{1,25}$/.test(value.channel)) return null;
  if (typeof value.userId !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(value.userId)) return null;
  if (typeof value.login !== "string" || value.login.length > 25) return null;
  if (typeof value.displayName !== "string" || typeof value.text !== "string") return null;
  if (typeof value.messageId !== "string" || !MESSAGE_ID.test(value.messageId)) return null;
  if (typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp))) return null;
  if (!isRecord(value.flags)) return null;
  const color = value.color === null ? null : typeof value.color === "string" ? value.color.toLowerCase() : undefined;
  if (color === undefined || (color !== null && !/^#[0-9a-f]{6}$/.test(color))) return null;
  const fragments = readFragments(value.fragments);
  if (fragments === null) return null;
  const badges = readBadges(value.badges);
  if (badges === null) return null;
  const payload: ChatMessagePayload = {
    platform,
    channel: value.channel,
    userId: value.userId,
    login: value.login,
    displayName: asUntrustedText(visiblePlain(value.displayName, 50)),
    color,
    badges,
    fragments,
    text: asUntrustedText(visiblePlain(value.text, 500)),
    timestamp: value.timestamp,
    messageId: value.messageId,
    flags: {
      isMod: value.flags.isMod === true,
      isBroadcaster: value.flags.isBroadcaster === true,
      isSubscriber: value.flags.isSubscriber === true,
      isVip: value.flags.isVip === true,
    },
  };
  if (value.donation !== undefined) {
    if (!isRecord(value.donation)) return null;
    const donationId = value.donation.donationId;
    const amountMinor = value.donation.amountMinor;
    const currency = value.donation.currency;
    if (typeof donationId !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(donationId)) return null;
    if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor < 1) return null;
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
    payload.donation = { donationId, amountMinor, currency, test: value.donation.test === true };
  }
  return payload;
}

function readFragments(value: unknown): ChatFragment[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const fragments: ChatFragment[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (item.type === "text" && typeof item.text === "string") {
      fragments.push({ type: "text", text: asUntrustedText(visiblePlain(item.text, 500)) });
      continue;
    }
    if (item.type === "emote" && typeof item.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(item.id)) {
      if (typeof item.name !== "string") return null;
      const emote: ChatFragment = { type: "emote", id: item.id, name: asUntrustedText(visiblePlain(item.name, 50)) };
      const imageUrl = safeChatImageUrl(item.imageUrl);
      if (imageUrl !== null) emote.imageUrl = imageUrl;
      fragments.push(emote);
      continue;
    }
    return null;
  }
  return fragments;
}

function readBadges(value: unknown): ChatMessagePayload["badges"] | null {
  if (!Array.isArray(value) || value.length > 16) return null;
  const badges: ChatMessagePayload["badges"][number][] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.setId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(item.setId)) return null;
    if (typeof item.version !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(item.version)) return null;
    if (typeof item.title !== "string") return null;
    const badge: ChatMessagePayload["badges"][number] = {
      setId: item.setId,
      version: item.version,
      title: asUntrustedText(visiblePlain(item.title, 40)),
    };
    const imageUrl = safeChatImageUrl(item.imageUrl);
    if (imageUrl !== null) badge.imageUrl = imageUrl;
    badges.push(badge);
  }
  return badges;
}

function readDelete(value: Record<string, unknown>): ChatDeletePayload | null {
  if (value.platform !== "twitch" && value.platform !== "youtube") return null;
  if (typeof value.channel !== "string" || !/^[a-z0-9_]{1,25}$/.test(value.channel)) return null;
  if (typeof value.messageId !== "string" || !MESSAGE_ID.test(value.messageId)) return null;
  const event: ChatDeletePayload = { platform: value.platform, channel: value.channel, messageId: value.messageId };
  if (typeof value.userId === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(value.userId)) event.userId = value.userId;
  return event;
}

function readClear(value: Record<string, unknown>): ChatClearPayload | null {
  if (value.platform !== "twitch" && value.platform !== "youtube") return null;
  if (typeof value.channel !== "string" || !/^[a-z0-9_]{1,25}$/.test(value.channel)) return null;
  const event: ChatClearPayload = { platform: value.platform, channel: value.channel };
  if (typeof value.userId === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(value.userId)) event.userId = value.userId;
  if (typeof value.durationSeconds === "number" && Number.isSafeInteger(value.durationSeconds) && value.durationSeconds >= 0) {
    event.durationSeconds = value.durationSeconds;
  }
  return event;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
