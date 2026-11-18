import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { manifest as alerts } from "@s4n/plugin-alerts";
import { manifest as chatOverlay } from "@s4n/plugin-chat-overlay";
import { manifest as ecpay } from "@s4n/plugin-ecpay";
import { manifest as goals } from "@s4n/plugin-goals";
import { manifest as opay } from "@s4n/plugin-opay";
import { manifest as ticker } from "@s4n/plugin-ticker";
import { manifest as tts } from "@s4n/plugin-tts";
import { manifest as twitchChat } from "@s4n/plugin-twitch-chat";
import { parseManifest, secretFieldKeys } from "@s4n/plugin-sdk";
import { createOfficialCatalog, createPaymentRegistry } from "./catalog.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const manifests = [
  ["ecpay", ecpay],
  ["opay", opay],
  ["alerts", alerts],
  ["chat-overlay", chatOverlay],
  ["twitch-chat", twitchChat],
  ["goals", goals],
  ["ticker", ticker],
  ["tts", tts],
] as const;

test("s4n-plugin.json matches the typed manifest", () => {
  for (const [folder, manifest] of manifests) {
    const json = JSON.parse(
      readFileSync(resolve(root, "plugins", folder, "s4n-plugin.json"), "utf8"),
    ) as unknown;
    assert.deepEqual(parseManifest(json), parseManifest(manifest));
  }
});

test("ECPay and O'Pay declare secret merchant fields and the other plugins do not", () => {
  for (const manifest of [ecpay, opay]) {
    const secrets = secretFieldKeys(manifest.settingsSchema);
    assert.deepEqual(secrets.sort(), ["hashIv", "hashKey", "merchantId"]);
    assert.equal(secrets.includes("environment"), false);
  }
  for (const manifest of [alerts, goals, ticker, tts, chatOverlay]) {
    assert.deepEqual(secretFieldKeys(manifest.settingsSchema), []);
  }
  assert.deepEqual(secretFieldKeys(twitchChat.settingsSchema).sort(), ["clientId", "clientSecret"]);
});

test("chat manifests keep display defaults and do not publish secret defaults", () => {
  const parsed = parseManifest(chatOverlay);
  assert.equal(parsed.settingsSchema.properties.mixDonations?.default, false);
  assert.equal(parsed.settingsSchema.properties.botNames?.["x-s4n-multiline"], true);
  assert.throws(() =>
    parseManifest({
      id: "official.example",
      name: "範例",
      version: "0.0.0",
      api: "0.1",
      kind: ["connector"],
      permissions: ["secrets"],
      entry: { worker: "./src/index.ts" },
      settingsSchema: {
        type: "object",
        properties: { token: { type: "string", "x-s4n-secret": true, default: "nope" } },
      },
    }),
  );
});

test("the official catalog loads two payment providers and the twitch source", () => {
  const catalog = createOfficialCatalog();
  assert.equal(catalog.length, 8);
  assert.equal(catalog.some((plugin) => plugin.manifest.id === "official.chat-overlay" && plugin.createChatSource === undefined), true);
  assert.equal(catalog.some((plugin) => plugin.manifest.id === "official.twitch-chat" && plugin.createChatSource !== undefined), true);
  assert.deepEqual(createPaymentRegistry(catalog).ids().sort(), ["official.ecpay", "official.opay"]);
});
