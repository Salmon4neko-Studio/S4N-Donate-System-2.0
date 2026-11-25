import type { ChatClearPayload, ChatDeletePayload, ChatMessagePayload } from "s4n-donate-system-2.0-events";
import {
  ANONYMOUS_PASS,
  anonymousNick,
  createMessageGate,
  interpretTwitchLine,
  MAX_IRC_LINE,
  normalizeChannel,
  type BadgeLookup,
} from "./irc.js";

export interface LineSocket {
  send(data: string): void;
  close(): void;
  onOpen(handler: () => void): void;
  onData(handler: (chunk: string) => void): void;
  onClose(handler: () => void): void;
}

export interface TwitchSessionOptions {
  channel: string;
  nick?: string;
  connect: () => LineSocket;
  onMessage: (message: ChatMessagePayload) => void;
  onDelete: (event: ChatDeletePayload) => void;
  onClear: (event: ChatClearPayload) => void;
  onRoom?: (roomId: string) => void;
  badge?: BadgeLookup;
  now?: () => number;
  random?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
  maxChars?: number;
  maxPerWindow?: number;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function backoffDelay(attempt: number): number {
  const step = Math.min(Math.max(attempt, 0), 5);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** step);
}

/**
 * Anonymous Twitch IRC session. PASS is always the public justinfan password.
 * Platform credentials never go on this socket.
 */
export function createTwitchChatSession(options: TwitchSessionOptions): {
  start(): void;
  stop(): void;
  applyChannel(channel: string): void;
} {
  let stopped = true;
  let started = false;
  let restart = false;
  let attempt = 0;
  let channel = normalizeChannel(options.channel);
  let socket: LineSocket | null = null;
  let cancelTimer: (() => void) | null = null;
  let buffer = "";
  const nick = options.nick ?? anonymousNick(options.random?.() ?? Math.random());
  const now = options.now ?? Date.now;
  const gate = createMessageGate({
    ...(options.maxChars !== undefined ? { maxChars: options.maxChars } : {}),
    ...(options.maxPerWindow !== undefined ? { maxPerWindow: options.maxPerWindow } : {}),
  });
  const seenRooms = new Set<string>();

  function schedule(fn: () => void, ms: number): void {
    cancelTimer?.();
    const scheduleFn = options.schedule ?? ((callback, delay) => {
      const id = setTimeout(callback, delay);
      return () => clearTimeout(id);
    });
    cancelTimer = scheduleFn(fn, ms);
  }

  function clearSchedule(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function sendLogin(current: LineSocket): void {
    if (channel === "") return;
    current.send("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n");
    current.send(`PASS ${ANONYMOUS_PASS}\r\n`);
    current.send(`NICK ${nick}\r\n`);
    current.send(`JOIN #${channel}\r\n`);
  }

  function connect(): void {
    if (stopped || channel === "") return;
    buffer = "";
    let current: LineSocket;
    try {
      current = options.connect();
    } catch {
      const delay = backoffDelay(attempt);
      attempt = Math.min(attempt + 1, 6);
      schedule(connect, delay);
      return;
    }
    socket = current;
    current.onOpen(() => {
      if (socket !== current || stopped) return;
      sendLogin(current);
    });
    current.onData((chunk) => {
      if (socket !== current || stopped) return;
      onData(current, chunk);
    });
    current.onClose(() => {
      if (socket !== current) return;
      socket = null;
      if (stopped || channel === "") return;
      if (restart) {
        restart = false;
        attempt = 0;
        connect();
        return;
      }
      const delay = backoffDelay(attempt);
      attempt = Math.min(attempt + 1, 6);
      schedule(connect, delay);
    });
  }

  function onData(current: LineSocket, chunk: string): void {
    buffer += chunk;
    if (buffer.length > 256_000) {
      buffer = "";
      current.close();
      return;
    }
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length > 0 && line.length <= MAX_IRC_LINE) handleLine(current, line);
      newline = buffer.indexOf("\n");
    }
  }

  function handleLine(current: LineSocket, line: string): void {
    const inbound = interpretTwitchLine(line, { now, ...(options.badge ? { badge: options.badge } : {}) });
    if (inbound === null || inbound.kind === "ignore") return;
    if (inbound.kind === "ping") {
      current.send(`${inbound.response}\r\n`);
      return;
    }
    if (inbound.kind === "reconnect") {
      restart = true;
      current.close();
      return;
    }
    if (inbound.kind === "ready") {
      attempt = 0;
      return;
    }
    if (inbound.kind === "delete") {
      options.onDelete(inbound.event);
      return;
    }
    if (inbound.kind === "clear") {
      options.onClear(inbound.event);
      return;
    }
    if (inbound.roomId !== null && !seenRooms.has(inbound.roomId)) {
      seenRooms.add(inbound.roomId);
      options.onRoom?.(inbound.roomId);
    }
    if (!gate.accept(inbound.message.text, now())) return;
    options.onMessage(inbound.message);
  }

  return {
    start() {
      started = true;
      stopped = false;
      if (socket !== null || channel === "") return;
      attempt = 0;
      connect();
    },
    stop() {
      stopped = true;
      started = false;
      restart = false;
      clearSchedule();
      socket?.close();
      socket = null;
      buffer = "";
    },
    applyChannel(next: string) {
      const normalized = normalizeChannel(next);
      if (normalized === channel && socket !== null) return;
      channel = normalized;
      seenRooms.clear();
      if (!started || stopped) return;
      attempt = 0;
      clearSchedule();
      if (socket !== null) {
        restart = channel !== "";
        socket.close();
        return;
      }
      if (channel !== "") connect();
    },
  };
}
