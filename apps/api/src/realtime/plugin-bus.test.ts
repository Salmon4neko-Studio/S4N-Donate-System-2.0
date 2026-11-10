import assert from "node:assert/strict";
import { test } from "node:test";
import { asUntrustedText } from "@s4n/events";
import { createPluginBus } from "@s4n/plugin-sdk";

test("plugins cannot emit core payment events, even through a cast", () => {
  const bus = createPluginBus({
    publish() {
      throw new Error("payment event was published");
    },
    subscribe() {
      return () => undefined;
    },
  });
  const emit = bus.emit as (type: string, payload: unknown) => void;
  assert.throws(() => emit("s4n.donation.succeeded", { donationId: "d" }), /cannot emit/);
});

test("plugins can emit a chat message through the SDK", () => {
  let published = "";
  const bus = createPluginBus({
    publish(type) {
      published = type;
    },
    subscribe() {
      return () => undefined;
    },
  });
  bus.emit("s4n.chat.message", {
    messageId: "m",
    platform: "youtube",
    channelId: "c",
    authorName: asUntrustedText("author"),
    text: asUntrustedText("hello"),
    sentAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(published, "s4n.chat.message");
});
