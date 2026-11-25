import { asUntrustedText, type ChatBadge, type ChatFragment, type ChatMessageFlags, type ChatMessagePayload } from "s4n-donate-system-2.0-events";

export const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
/** Public anonymous password. This is not a stored credential. */
export const ANONYMOUS_PASS = "SCHMOOPIIE";
export const MAX_CHAT_CHARS = 500;
export const MAX_IRC_LINE = 4096;
export const MAX_NAME_CHARS = 50;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

const BADGE_TITLES: Record<string, string> = {
  broadcaster: "實況主",
  moderator: "管理員",
  subscriber: "訂閱者",
  vip: "VIP",
  premium: "Prime",
  partner: "夥伴",
  staff: "工作人員",
  founder: "創始訂閱",
  bits: "小奇點",
  artist: "藝術家",
  "no_audio": "無聲",
  "no_video": "無畫面",
};

export interface BadgeLookup {
  (roomId: string, setId: string, version: string): { title: string; imageUrl?: string } | null;
}

export interface ParsedIrcLine {
  tags: ReadonlyMap<string, string>;
  prefix: string | null;
  command: string;
  params: string[];
  trailing: string | null;
}

export type TwitchInbound =
  | { kind: "ping"; response: string }
  | { kind: "reconnect" }
  | { kind: "ready" }
  | { kind: "message"; message: ChatMessagePayload; roomId: string | null }
  | { kind: "delete"; event: import("s4n-donate-system-2.0-events").ChatDeletePayload }
  | { kind: "clear"; event: import("s4n-donate-system-2.0-events").ChatClearPayload }
  | { kind: "ignore" };

export function anonymousNick(random: number): string {
  const unit = Number.isFinite(random) ? Math.min(0.99999, Math.max(0, random)) : 0;
  const n = 10_000 + Math.floor(unit * 90_000);
  return `justinfan${n}`;
}

export function normalizeChannel(value: string): string {
  const trimmed = value.trim().replace(/^#/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(trimmed)) return "";
  return trimmed;
}

export function twitchEmoteUrl(id: string): string | null {
  if (!/^\d{1,20}$/.test(id)) return null;
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
}

export function visibleChatText(value: string, max = MAX_CHAT_CHARS): string {
  return stripControls(value).slice(0, max);
}

function stripControls(value: string): string {
  return value.replace(CONTROL, "");
}

function sanitizeFragments(fragments: ChatFragment[]): ChatFragment[] {
  const clean: ChatFragment[] = [];
  for (const fragment of fragments) {
    if (fragment.type === "text") {
      const text = stripControls(fragment.text);
      if (text.length === 0) continue;
      clean.push({ type: "text", text: asUntrustedText(text) });
      continue;
    }
    const name = stripControls(fragment.name);
    if (name.length === 0) continue;
    const emote: ChatFragment = fragment.imageUrl === undefined
      ? { type: "emote", id: fragment.id, name: asUntrustedText(name) }
      : { type: "emote", id: fragment.id, name: asUntrustedText(name), imageUrl: fragment.imageUrl };
    clean.push(emote);
  }
  return clean;
}

export function createMessageGate(options?: { maxChars?: number; maxPerWindow?: number; windowMs?: number }) {
  const maxChars = options?.maxChars ?? MAX_CHAT_CHARS;
  const maxPerWindow = options?.maxPerWindow ?? 30;
  const windowMs = options?.windowMs ?? 10_000;
  const stamps: number[] = [];
  return {
    accept(text: string, now: number): boolean {
      if (text.length === 0 || text.length > maxChars) return false;
      while (stamps.length > 0 && (stamps[0] ?? 0) <= now - windowMs) stamps.shift();
      if (stamps.length >= maxPerWindow) return false;
      stamps.push(now);
      return true;
    },
  };
}

export function parseIrcLine(line: string): ParsedIrcLine | null {
  if (line.length === 0 || line.length > MAX_IRC_LINE) return null;
  let rest = line;
  let tags = new Map<string, string>();
  if (rest.startsWith("@")) {
    const space = rest.indexOf(" ");
    if (space < 1) return null;
    tags = parseTags(rest.slice(1, space));
    rest = rest.slice(space + 1).trimStart();
  }
  let prefix: string | null = null;
  if (rest.startsWith(":")) {
    const space = rest.indexOf(" ");
    if (space < 1) return null;
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1).trimStart();
  }
  if (rest.length === 0) return null;
  const commandEnd = rest.indexOf(" ");
  const command = (commandEnd === -1 ? rest : rest.slice(0, commandEnd)).toUpperCase();
  if (!/^[A-Z0-9]+$/.test(command)) return null;
  rest = commandEnd === -1 ? "" : rest.slice(commandEnd + 1).trimStart();
  const params: string[] = [];
  let trailing: string | null = null;
  while (rest.length > 0) {
    if (rest.startsWith(":")) {
      trailing = rest.slice(1);
      break;
    }
    const space = rest.indexOf(" ");
    if (space === -1) {
      params.push(rest);
      break;
    }
    params.push(rest.slice(0, space));
    rest = rest.slice(space + 1).trimStart();
  }
  return { tags, prefix, command, params, trailing };
}

export function interpretTwitchLine(
  line: string,
  context: { now: () => number; badge?: BadgeLookup },
): TwitchInbound | null {
  const parsed = parseIrcLine(line.trim());
  if (parsed === null) return null;
  if (parsed.command === "PING") {
    const raw = parsed.trailing ?? parsed.params[0] ?? "tmi.twitch.tv";
    const trailer = raw.replace(/[\r\n]/g, "");
    return { kind: "ping", response: `PONG :${trailer === "" ? "tmi.twitch.tv" : trailer}` };
  }
  if (parsed.command === "RECONNECT") return { kind: "reconnect" };
  if (parsed.command === "001" || parsed.command === "JOIN") return { kind: "ready" };
  if (parsed.command === "PRIVMSG") return readPrivmsg(parsed, context);
  if (parsed.command === "CLEARMSG") return readClearMsg(parsed);
  if (parsed.command === "CLEARCHAT") return readClearChat(parsed);
  return { kind: "ignore" };
}

export function fragmentsFromEmotes(text: string, emotesTag: string): ChatFragment[] {
  const ranges: { start: number; end: number; id: string }[] = [];
  if (emotesTag.trim() !== "") {
    for (const group of emotesTag.split("/")) {
      const colon = group.indexOf(":");
      if (colon <= 0) continue;
      const id = group.slice(0, colon);
      if (!/^\d{1,20}$/.test(id)) continue;
      for (const span of group.slice(colon + 1).split(",")) {
        const dash = span.indexOf("-");
        if (dash <= 0) continue;
        const start = Number(span.slice(0, dash));
        const end = Number(span.slice(dash + 1));
        if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
        if (start < 0 || end < start || end >= text.length) continue;
        ranges.push({ start, end, id });
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const fragments: ChatFragment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) {
      const slice = text.slice(cursor, range.start);
      if (slice.length > 0) fragments.push({ type: "text", text: asUntrustedText(slice) });
    }
    const name = text.slice(range.start, range.end + 1);
    const imageUrl = twitchEmoteUrl(range.id);
    const emote: ChatFragment = imageUrl === null
      ? { type: "emote", id: range.id, name: asUntrustedText(name) }
      : { type: "emote", id: range.id, name: asUntrustedText(name), imageUrl };
    fragments.push(emote);
    cursor = range.end + 1;
  }
  if (cursor < text.length) {
    fragments.push({ type: "text", text: asUntrustedText(text.slice(cursor)) });
  }
  if (fragments.length === 0) fragments.push({ type: "text", text: asUntrustedText(text) });
  return fragments.slice(0, 40);
}

function readPrivmsg(parsed: ParsedIrcLine, context: { now: () => number; badge?: BadgeLookup }): TwitchInbound {
  const channel = normalizeChannel(parsed.params[0] ?? "");
  const rawText = parsed.trailing ?? "";
  const text = stripControls(rawText);
  const messageId = parsed.tags.get("id") ?? "";
  const userId = parsed.tags.get("user-id") ?? "";
  if (channel === "" || rawText.length === 0 || rawText.length > MAX_CHAT_CHARS || text.length === 0) {
    return { kind: "ignore" };
  }
  if (!SAFE_ID.test(messageId) || !/^\d{1,20}$/.test(userId)) return { kind: "ignore" };
  const login = loginFrom(parsed);
  const display = visibleChatText(parsed.tags.get("display-name") || login || userId, MAX_NAME_CHARS);
  if (display.length === 0) return { kind: "ignore" };
  const roomId = parsed.tags.get("room-id") ?? "";
  const safeRoom = /^\d{1,20}$/.test(roomId) ? roomId : null;
  const badges = parseBadges(parsed.tags.get("badges") ?? "", safeRoom ?? "", context.badge);
  const parsedFragments = sanitizeFragments(fragmentsFromEmotes(rawText, parsed.tags.get("emotes") ?? ""));
  const fragments = parsedFragments.length > 0 ? parsedFragments : [{ type: "text" as const, text: asUntrustedText(text) }];
  const message: ChatMessagePayload = {
    platform: "twitch",
    channel,
    userId,
    login,
    displayName: asUntrustedText(display),
    color: normalizeColor(parsed.tags.get("color")),
    badges,
    fragments,
    text: asUntrustedText(text),
    timestamp: timestampFrom(parsed.tags.get("tmi-sent-ts"), context.now()),
    messageId,
    flags: flagsFrom(parsed.tags, badges, userId, safeRoom),
  };
  return { kind: "message", message, roomId: safeRoom };
}

function readClearMsg(parsed: ParsedIrcLine): TwitchInbound {
  const channel = normalizeChannel(parsed.params[0] ?? "");
  const messageId = parsed.tags.get("target-msg-id") ?? "";
  if (channel === "" || !SAFE_ID.test(messageId)) return { kind: "ignore" };
  const userId = parsed.tags.get("target-user-id") ?? "";
  const event: import("s4n-donate-system-2.0-events").ChatDeletePayload = {
    platform: "twitch",
    channel,
    messageId,
  };
  if (/^\d{1,20}$/.test(userId)) event.userId = userId;
  return { kind: "delete", event };
}

function readClearChat(parsed: ParsedIrcLine): TwitchInbound {
  const channel = normalizeChannel(parsed.params[0] ?? "");
  if (channel === "") return { kind: "ignore" };
  const userId = parsed.tags.get("target-user-id") ?? "";
  const duration = parsed.tags.get("ban-duration");
  const event: import("s4n-donate-system-2.0-events").ChatClearPayload = { platform: "twitch", channel };
  if (/^\d{1,20}$/.test(userId)) event.userId = userId;
  if (duration !== undefined && /^\d{1,8}$/.test(duration)) {
    const seconds = Number(duration);
    if (Number.isSafeInteger(seconds)) event.durationSeconds = seconds;
  }
  return { kind: "clear", event };
}

function parseTags(raw: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of raw.split(";")) {
    if (part.length === 0) continue;
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    if (!/^[a-zA-Z0-9-]+$/.test(key)) continue;
    tags.set(key, eq === -1 ? "" : unescapeTag(part.slice(eq + 1)));
  }
  return tags;
}

function unescapeTag(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== "\\" || i + 1 >= value.length) {
      out += char ?? "";
      continue;
    }
    const next = value[i + 1];
    i += 1;
    if (next === ":") out += ";";
    else if (next === "s") out += " ";
    else if (next === "\\") out += "\\";
    else if (next === "r") out += "\r";
    else if (next === "n") out += "\n";
    else out += next ?? "";
  }
  return out;
}

function loginFrom(parsed: ParsedIrcLine): string {
  const prefix = parsed.prefix ?? "";
  const nick = prefix.split("!")[0]?.toLowerCase() ?? "";
  if (/^[a-z0-9_]{1,25}$/.test(nick)) return nick;
  return "";
}

function normalizeColor(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  return value.toLowerCase();
}

function timestampFrom(raw: string | undefined, now: number): string {
  if (raw !== undefined && /^\d{10,16}$/.test(raw)) {
    const ms = Number(raw);
    if (Number.isSafeInteger(ms)) return new Date(ms).toISOString();
  }
  return new Date(now).toISOString();
}

function parseBadges(tag: string, roomId: string, lookup: BadgeLookup | undefined): ChatBadge[] {
  if (tag.trim() === "") return [];
  const badges: ChatBadge[] = [];
  for (const part of tag.split(",")) {
    const slash = part.indexOf("/");
    if (slash <= 0) continue;
    const setId = part.slice(0, slash);
    const version = part.slice(slash + 1);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(setId) || !/^[A-Za-z0-9_-]{1,40}$/.test(version)) continue;
    const resolved = lookup?.(roomId, setId, version) ?? null;
    const title = visibleChatText(resolved?.title || BADGE_TITLES[setId] || setId, 40);
    const badge: ChatBadge = { setId, version, title: asUntrustedText(title) };
    const imageUrl = resolved?.imageUrl;
    if (imageUrl !== undefined && isTwitchCdnUrl(imageUrl)) badge.imageUrl = imageUrl;
    badges.push(badge);
    if (badges.length >= 16) break;
  }
  return badges;
}

function flagsFrom(
  tags: ReadonlyMap<string, string>,
  badges: readonly ChatBadge[],
  userId: string,
  roomId: string | null,
): ChatMessageFlags {
  const sets = new Set(badges.map((badge) => badge.setId));
  return {
    isMod: tags.get("mod") === "1" || sets.has("moderator"),
    isBroadcaster: sets.has("broadcaster") || (roomId !== null && userId === roomId),
    isSubscriber: tags.get("subscriber") === "1" || sets.has("subscriber") || sets.has("founder"),
    isVip: tags.get("vip") === "1" || sets.has("vip"),
  };
}

export function isTwitchCdnUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname === "static-cdn.jtvnw.net" && url.username === "" && url.password === "";
}

export function fallbackBadgeTitle(setId: string): string {
  return BADGE_TITLES[setId] ?? setId;
}
