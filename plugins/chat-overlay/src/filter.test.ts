import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText, type ChatMessagePayload } from "@s4n/events";
import { donationAsChatMessage } from "./donation.js";
import { maskKeywords, shouldHideChatMessage } from "./filter.js";
import { manifest } from "./manifest.js";
import { previewChatMessage } from "./preview.js";
import { parseChatOverlaySettings } from "./settings.js";
import { presentChatMessage, readChatWireEvent, reduceChatLines, safeChatImageUrl } from "./view.js";

const settings = parseChatOverlaySettings({});

function line(overrides: Partial<ChatMessagePayload> = {}): ChatMessagePayload {
  return {
    platform: "twitch",
    channel: "ada",
    userId: "7",
    login: "ada",
    displayName: asUntrustedText("Ada"),
    color: "#ff0000",
    badges: [],
    fragments: [{ type: "text", text: asUntrustedText("hello") }],
    text: asUntrustedText("hello"),
    timestamp: "2026-01-01T00:00:00.000Z",
    messageId: "m1",
    flags: { isMod: false, isBroadcaster: false, isSubscriber: false, isVip: false },
    ...overrides,
  };
}

test("manifest defaults match the settings parser", () => {
  const raw: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(manifest.settingsSchema.properties)) {
    if (field.default !== undefined) raw[key] = field.default;
  }
  assert.equal(settings.hideBots, true);
  assert.equal(settings.hideCommands, true);
  assert.equal(settings.mixDonations, false);
  assert.equal(settings.lifetimeSeconds, 0);
  assert.equal(settings.syncModeration, true);
  assert.deepEqual(parseChatOverlaySettings(raw), settings);
});

test("bots, commands, and keyword masks follow the overlay settings", () => {
  assert.equal(shouldHideChatMessage(line({ displayName: asUntrustedText("Nightbot"), login: "nightbot" }), settings), true);
  assert.equal(
    shouldHideChatMessage(line({ displayName: asUntrustedText("Night Bot"), login: "nightbot", text: asUntrustedText("hi") }), settings),
    true,
  );
  assert.equal(shouldHideChatMessage(line({ text: asUntrustedText("!song"), fragments: [{ type: "text", text: asUntrustedText("!song") }] }), settings), true);
  assert.equal(shouldHideChatMessage(line(), settings), false);
  assert.equal(shouldHideChatMessage(line({ text: asUntrustedText("!song") }), parseChatOverlaySettings({ hideCommands: false })), false);
  assert.equal(shouldHideChatMessage(line({ login: "nightbot" }), parseChatOverlaySettings({ hideBots: false })), false);

  const donation = donationAsChatMessage(
    {
      donationId: "test_1",
      providerId: "s4n.test",
      amountMinor: 300,
      currency: "TWD",
      donorName: asUntrustedText("Nightbot"),
      message: asUntrustedText("!hi"),
      test: true,
    },
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(shouldHideChatMessage(donation, settings), false);
  assert.equal(maskKeywords("這是垃圾訊息", ["垃圾"]), "這是＊＊訊息");
  assert.equal(maskKeywords("Spam spam", ["spam"]), "＊＊＊＊ ＊＊＊＊");
  assert.equal(maskKeywords("hello", []), "hello");
});

test("deleted messages and bans leave the overlay, and HTML stays text", () => {
  const first = presentChatMessage(line({ messageId: "m1", userId: "1" }), settings);
  const second = presentChatMessage(
    line({
      messageId: "m2",
      userId: "2",
      text: asUntrustedText("<img src=x onerror=alert(1)>"),
      fragments: [{ type: "text", text: asUntrustedText("<img src=x onerror=alert(1)>") }],
    }),
    settings,
  );
  assert.ok(first && second);
  assert.equal(second.parts[0]?.type === "text" ? second.parts[0].text : "", "<img src=x onerror=alert(1)>");
  const kept = reduceChatLines(
    [first, second],
    { type: "s4n.chat.delete", payload: { platform: "twitch", channel: "ada", messageId: "m1" } },
    settings,
    Date.parse("2026-01-01T00:00:00.000Z"),
  );
  assert.deepEqual(kept.map((item) => item.messageId), ["m2"]);
  const banned = reduceChatLines(
    kept,
    { type: "s4n.chat.clear", payload: { platform: "twitch", channel: "ada", userId: "2", durationSeconds: 30 } },
    settings,
    Date.parse("2026-01-01T00:00:00.000Z"),
  );
  assert.deepEqual(banned, []);
  const stuck = reduceChatLines(
    [first],
    { type: "s4n.chat.clear", payload: { platform: "twitch", channel: "ada" } },
    parseChatOverlaySettings({ syncModeration: false }),
    Date.parse("2026-01-01T00:00:00.000Z"),
  );
  assert.equal(stuck.length, 1);
});

test("preview and donation lines survive the wire reader, and foreign image URLs do not", () => {
  const preview = previewChatMessage({
    displayName: "小滿<script>",
    text: "大家好",
    now: "2026-01-01T00:00:00.000Z",
    messageId: "preview-1",
  });
  const read = readChatWireEvent({ type: "s4n.chat.message", payload: preview });
  assert.ok(read && read.type === "s4n.chat.message");
  if (!read || read.type !== "s4n.chat.message") return;
  assert.equal(read.payload.displayName, "小滿<script>");
  assert.equal(read.payload.fragments.some((fragment) => fragment.type === "emote" && fragment.id === "25"), true);
  assert.equal(safeChatImageUrl("javascript:alert(1)"), null);
  assert.equal(safeChatImageUrl("https://evil.example/kappa.png"), null);
  assert.equal(safeChatImageUrl(preview.badges[0]?.imageUrl)?.startsWith("https://static-cdn.jtvnw.net/"), true);

  const donation = donationAsChatMessage(
    {
      donationId: "paid1",
      providerId: "official.ecpay",
      providerRef: "ref",
      amountMinor: 520,
      currency: "TWD",
      donorName: asUntrustedText("小光"),
      message: asUntrustedText("謝謝"),
    },
    "2026-01-01T00:00:00.000Z",
  );
  const shown = presentChatMessage(donation, parseChatOverlaySettings({ mixDonations: true, keywords: "謝謝" }));
  assert.ok(shown?.donation);
  assert.equal(shown?.donation?.test, false);
  assert.equal(shown?.parts[0]?.type === "text" ? shown.parts[0].text : "", "＊＊");
});

test("a replayed chat line with the same message id is not shown twice", () => {
  const payload = line();
  const event = { type: "s4n.chat.message" as const, payload };
  const once = reduceChatLines([], event, settings, Date.parse("2026-01-01T00:00:00.000Z"));
  const twice = reduceChatLines(once, event, settings, Date.parse("2026-01-01T00:00:00.000Z"));
  assert.equal(twice.length, 1);
  assert.equal(twice[0]?.messageId, "m1");
});
