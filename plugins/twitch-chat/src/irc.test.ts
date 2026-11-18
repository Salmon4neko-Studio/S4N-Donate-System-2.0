import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anonymousNick,
  createMessageGate,
  fragmentsFromEmotes,
  interpretTwitchLine,
  normalizeChannel,
  parseIrcLine,
} from "./irc.js";

const PRIVMSG = [
  "@badge-info=;badges=broadcaster/1,subscriber/0;color=#0000FF;display-name=Cool\\sName;emotes=25:0-4,12-16;id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;mod=0;room-id=12345678;subscriber=1;tmi-sent-ts=1507246572675;user-id=1234;user-type=",
  " :ronni!ronni@ronni.tmi.twitch.tv PRIVMSG #ronni :Kappa Keepo Kappa",
].join("");

test("parseIrcLine keeps tags, prefix, command, and the trailing message", () => {
  const line = parseIrcLine(PRIVMSG);
  assert.ok(line);
  assert.equal(line.command, "PRIVMSG");
  assert.equal(line.tags.get("display-name"), "Cool Name");
  assert.equal(line.tags.get("emotes"), "25:0-4,12-16");
  assert.equal(line.prefix, "ronni!ronni@ronni.tmi.twitch.tv");
  assert.deepEqual(line.params, ["#ronni"]);
  assert.equal(line.trailing, "Kappa Keepo Kappa");
});

test("PRIVMSG becomes a normalized message with emote fragments, badges, and flags", () => {
  const inbound = interpretTwitchLine(PRIVMSG, { now: () => 0 });
  assert.ok(inbound && inbound.kind === "message");
  if (inbound.kind !== "message") return;
  const { message } = inbound;
  assert.equal(message.platform, "twitch");
  assert.equal(message.channel, "ronni");
  assert.equal(message.userId, "1234");
  assert.equal(message.login, "ronni");
  assert.equal(message.displayName, "Cool Name");
  assert.equal(message.color, "#0000ff");
  assert.equal(message.messageId, "b34ccfc7-4977-403a-8a94-33c6bac34fb8");
  assert.equal(message.timestamp, new Date(1507246572675).toISOString());
  assert.equal(message.text, "Kappa Keepo Kappa");
  assert.deepEqual(message.flags, {
    isMod: false,
    isBroadcaster: true,
    isSubscriber: true,
    isVip: false,
  });
  assert.deepEqual(
    message.badges.map((badge) => badge.setId),
    ["broadcaster", "subscriber"],
  );
  assert.equal(message.badges[0]?.title, "實況主");
  assert.equal(message.fragments[0]?.type, "emote");
  assert.equal(message.fragments[0]?.type === "emote" ? message.fragments[0].id : "", "25");
  assert.equal(message.fragments[0]?.type === "emote" ? message.fragments[0].name : "", "Kappa");
  assert.equal(
    message.fragments[0]?.type === "emote" ? message.fragments[0].imageUrl : "",
    "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0",
  );
  assert.equal(message.fragments[1]?.type === "text" ? message.fragments[1].text : "", " Keepo ");
  assert.equal(message.fragments[2]?.type === "emote" ? message.fragments[2].name : "", "Kappa");
  assert.equal(message.text.includes("<"), false);
});

test("HTML in a chat line stays text and is not a fragment type", () => {
  const inbound = interpretTwitchLine(
    "@badges=;color=;display-name=ada;emotes=;id=abc123;mod=1;room-id=9;subscriber=0;user-id=9 :ada!ada@ada.tmi.twitch.tv PRIVMSG #ada :<script>alert(1)</script>",
    { now: () => 1_700_000_000_000 },
  );
  assert.ok(inbound && inbound.kind === "message");
  if (inbound.kind !== "message") return;
  assert.equal(inbound.message.flags.isMod, true);
  assert.equal(inbound.message.flags.isBroadcaster, true);
  assert.equal(inbound.message.color, null);
  assert.equal(inbound.message.fragments[0]?.type, "text");
  assert.equal(inbound.message.text, "<script>alert(1)</script>");
});

test("CLEARMSG and CLEARCHAT become delete and clear events", () => {
  const deleted = interpretTwitchLine(
    "@login=ronni;target-msg-id=abc123 :tmi.twitch.tv CLEARMSG #dallas :HeyGuys",
    { now: () => 0 },
  );
  assert.deepEqual(deleted, {
    kind: "delete",
    event: { platform: "twitch", channel: "dallas", messageId: "abc123" },
  });

  const timeout = interpretTwitchLine(
    "@ban-duration=600;room-id=123;target-user-id=456 :tmi.twitch.tv CLEARCHAT #dallas :ronni",
    { now: () => 0 },
  );
  assert.deepEqual(timeout, {
    kind: "clear",
    event: { platform: "twitch", channel: "dallas", userId: "456", durationSeconds: 600 },
  });

  const ban = interpretTwitchLine(
    "@room-id=123;target-user-id=456 :tmi.twitch.tv CLEARCHAT #dallas :ronni",
    { now: () => 0 },
  );
  assert.deepEqual(ban, {
    kind: "clear",
    event: { platform: "twitch", channel: "dallas", userId: "456" },
  });

  const wiped = interpretTwitchLine(":tmi.twitch.tv CLEARCHAT #dallas", { now: () => 0 });
  assert.deepEqual(wiped, { kind: "clear", event: { platform: "twitch", channel: "dallas" } });
});

test("PING and RECONNECT are recognized and oversized chat is dropped", () => {
  assert.deepEqual(interpretTwitchLine("PING :tmi.twitch.tv", { now: () => 0 }), {
    kind: "ping",
    response: "PONG :tmi.twitch.tv",
  });
  assert.deepEqual(interpretTwitchLine(":tmi.twitch.tv RECONNECT", { now: () => 0 }), { kind: "reconnect" });
  const huge = interpretTwitchLine(
    `@id=abc;user-id=1;display-name=ada :ada!ada@ada.tmi.twitch.tv PRIVMSG #ada :${"a".repeat(501)}`,
    { now: () => 0 },
  );
  assert.deepEqual(huge, { kind: "ignore" });
});

test("emote indexes that fall outside the message do not throw", () => {
  const fragments = fragmentsFromEmotes("hi", "25:0-4");
  assert.equal(fragments.length, 1);
  assert.equal(fragments[0]?.type, "text");
});

test("anonymous nicks and channel names stay inside Twitch's login shape", () => {
  assert.equal(anonymousNick(0), "justinfan10000");
  assert.equal(anonymousNick(0.5), "justinfan55000");
  assert.match(anonymousNick(0.99999), /^justinfan\d{5}$/);
  assert.equal(normalizeChannel("#Dallas"), "dallas");
  assert.equal(normalizeChannel("no spaces"), "");
  assert.equal(normalizeChannel(""), "");
});

test("the text gate drops empty, oversized, and excess lines", () => {
  const gate = createMessageGate({ maxChars: 5, maxPerWindow: 2, windowMs: 1_000 });
  assert.equal(gate.accept("", 0), false);
  assert.equal(gate.accept("abcdef", 0), false);
  assert.equal(gate.accept("hi", 0), true);
  assert.equal(gate.accept("yo", 10), true);
  assert.equal(gate.accept("no", 20), false);
  assert.equal(gate.accept("ok", 1_001), true);
});
