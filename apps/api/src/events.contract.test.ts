import assert from "node:assert/strict";
import { test } from "node:test";
import { S4N_EVENT_NAMES, asUntrustedText, type S4nEventMap } from "@s4n/events";

const samples = {
  "s4n.donation.created": {
    donationId: "d",
    providerId: "official.ecpay",
    amountMinor: 100,
    currency: "TWD",
    donorName: asUntrustedText("donor"),
    message: asUntrustedText("message"),
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  "s4n.donation.succeeded": {
    donationId: "d",
    providerId: "official.ecpay",
    providerRef: "ref",
    amountMinor: 100,
    currency: "TWD",
    donorName: asUntrustedText("donor"),
    message: asUntrustedText("message"),
  },
  "s4n.donation.failed": {
    donationId: "d",
    providerId: "official.ecpay",
    reason: "declined",
  },
  "s4n.donation.test": {
    donationId: "test_d",
    providerId: "s4n.test",
    amountMinor: 100,
    currency: "TWD",
    donorName: asUntrustedText("donor"),
    message: asUntrustedText("message"),
    test: true,
  },
  "s4n.chat.message": {
    platform: "twitch",
    channel: "c",
    userId: "1",
    login: "author",
    displayName: asUntrustedText("author"),
    color: null,
    badges: [],
    fragments: [{ type: "text", text: asUntrustedText("hello") }],
    text: asUntrustedText("hello"),
    timestamp: "2026-01-01T00:00:00.000Z",
    messageId: "m",
    flags: { isMod: false, isBroadcaster: false, isSubscriber: false, isVip: false },
  },
  "s4n.chat.delete": {
    platform: "twitch",
    channel: "c",
    messageId: "m",
  },
  "s4n.chat.clear": {
    platform: "youtube",
    channel: "c",
    userId: "1",
  },
  "s4n.goal.updated": {
    goalId: "g",
    title: "新麥克風",
    currentMinor: 10,
    targetMinor: 100,
    currency: "TWD",
  },
  "s4n.tts.request": {
    requestId: "t",
    text: asUntrustedText("不要直接朗讀"),
  },
  "s4n.media.now_playing": {
    mediaId: "m",
    title: "track",
    requestedBy: asUntrustedText("donor"),
  },
  "s4n.plugin.changed": {
    action: "install",
    pluginId: "official.alerts",
    version: "0.1.0",
    previousVersion: null,
    permissions: ["events.subscribe", "overlay.slot"],
    addedPermissions: [],
    removedPermissions: [],
    source: "official",
    dataKept: null,
  },
} satisfies { [T in keyof S4nEventMap]: S4nEventMap[T] };

test("event samples cover the shared catalog", () => {
  assert.deepEqual(Object.keys(samples).sort(), [...S4N_EVENT_NAMES].sort());
});
