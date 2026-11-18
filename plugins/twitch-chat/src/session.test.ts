import assert from "node:assert/strict";
import { test } from "node:test";
import { ANONYMOUS_PASS } from "./irc.js";
import { createTwitchChatSession, type LineSocket } from "./session.js";

class FakeIrc implements LineSocket {
  sent: string[] = [];
  closed = false;
  private openHandlers: Array<() => void> = [];
  private dataHandlers: Array<(chunk: string) => void> = [];
  private closeHandlers: Array<() => void> = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) handler();
  }

  onOpen(handler: () => void): void {
    this.openHandlers.push(handler);
  }

  onData(handler: (chunk: string) => void): void {
    this.dataHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  open(): void {
    for (const handler of this.openHandlers) handler();
  }

  receive(chunk: string): void {
    for (const handler of this.dataHandlers) handler(chunk);
  }
}

function harness(maxPerWindow = 30) {
  const sockets: FakeIrc[] = [];
  const messages: string[] = [];
  const deleted: string[] = [];
  const cleared: Array<string | undefined> = [];
  const timers: Array<{ ms: number; run: () => void; cancelled: boolean }> = [];
  const session = createTwitchChatSession({
    channel: "Dallas",
    nick: "justinfan4242",
    maxPerWindow,
    connect: () => {
      const socket = new FakeIrc();
      sockets.push(socket);
      return socket;
    },
    onMessage: (message) => messages.push(message.text),
    onDelete: (event) => deleted.push(event.messageId),
    onClear: (event) => cleared.push(event.userId),
    schedule: (fn, ms) => {
      const item = { ms, run: fn, cancelled: false };
      timers.push(item);
      return () => {
        item.cancelled = true;
      };
    },
    now: () => 1_700_000_000_000,
  });
  return { sockets, messages, deleted, cleared, timers, session };
}

const SAMPLE = "@badges=moderator/1;color=#FF0000;display-name=Ada;emotes=;id=abc123;mod=1;room-id=7;subscriber=0;user-id=7 :ada!ada@ada.tmi.twitch.tv PRIVMSG #dallas :hello\r\n";

test("anonymous login uses justinfan and never a caller-supplied password", () => {
  const { sockets, session } = harness();
  session.start();
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  const sent = socket.sent.join("");
  assert.match(sent, /PASS SCHMOOPIIE\r\n/);
  assert.equal(sent.includes(ANONYMOUS_PASS), true);
  assert.match(sent, /NICK justinfan4242\r\n/);
  assert.match(sent, /JOIN #dallas\r\n/);
  assert.equal(sent.includes("oauth:"), false);
  assert.equal(sent.includes("client_secret"), false);
});

test("PING is answered and a split chunk still parses", () => {
  const { sockets, session } = harness();
  session.start();
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  socket.receive("PING :tmi.twitch.tv\r");
  assert.equal(socket.sent.some((line) => line.startsWith("PONG")), false);
  socket.receive("\n");
  assert.equal(socket.sent.at(-1), "PONG :tmi.twitch.tv\r\n");
});

test("reconnect uses backoff, and RECONNECT opens a new socket", () => {
  const { sockets, timers, session } = harness();
  session.start();
  const first = sockets[0];
  assert.ok(first);
  first.open();
  first.receive(":tmi.twitch.tv RECONNECT\r\n");
  assert.equal(sockets.length, 2);
  const second = sockets[1];
  assert.ok(second);
  second.open();
  second.close();
  assert.equal(timers[0]?.ms, 1000);
  timers[0]?.run();
  assert.equal(sockets.length, 3);
  sockets[2]?.close();
  assert.equal(timers[1]?.ms, 2000);
});

test("incoming chat is rate limited and moderation events are forwarded", () => {
  const { sockets, messages, deleted, cleared, session } = harness(1);
  session.start();
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  socket.receive(SAMPLE + SAMPLE);
  assert.deepEqual(messages, ["hello"]);
  socket.receive("@target-msg-id=abc123 :tmi.twitch.tv CLEARMSG #dallas :hello\r\n");
  socket.receive("@target-user-id=7 :tmi.twitch.tv CLEARCHAT #dallas :ada\r\n");
  socket.receive(":tmi.twitch.tv CLEARCHAT #dallas\r\n");
  assert.deepEqual(deleted, ["abc123"]);
  assert.deepEqual(cleared, ["7", undefined]);
});
