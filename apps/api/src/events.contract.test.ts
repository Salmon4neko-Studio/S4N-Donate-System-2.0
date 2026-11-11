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
    messageId: "m",
    platform: "twitch",
    channelId: "c",
    authorName: asUntrustedText("author"),
    text: asUntrustedText("hello"),
    sentAt: "2026-01-01T00:00:00.000Z",
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
} satisfies { [T in keyof S4nEventMap]: S4nEventMap[T] };

test("event samples cover the shared catalog", () => {
  assert.deepEqual(Object.keys(samples).sort(), [...S4N_EVENT_NAMES].sort());
});
