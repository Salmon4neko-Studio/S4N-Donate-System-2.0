import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { manifest as alerts } from "s4n-donate-system-2.0-plugin-alerts";
import { manifest as chatOverlay } from "s4n-donate-system-2.0-plugin-chat-overlay";
import { manifest as ecpay } from "s4n-donate-system-2.0-plugin-ecpay";
import { manifest as ecpayAtm } from "s4n-donate-system-2.0-plugin-ecpay-atm";
import { manifest as ecpayBarcode } from "s4n-donate-system-2.0-plugin-ecpay-barcode";
import { manifest as ecpayCvs } from "s4n-donate-system-2.0-plugin-ecpay-cvs";
import { manifest as goals } from "s4n-donate-system-2.0-plugin-goals";
import { manifest as opay } from "s4n-donate-system-2.0-plugin-opay";
import { manifest as opayAtm } from "s4n-donate-system-2.0-plugin-opay-atm";
import { manifest as opayCvs } from "s4n-donate-system-2.0-plugin-opay-cvs";
import { manifest as ticker } from "s4n-donate-system-2.0-plugin-ticker";
import { manifest as twitchChat } from "s4n-donate-system-2.0-plugin-twitch-chat";
import { hasPluginSettingsNav, parseManifest, publicFieldKeys, secretFieldKeys } from "s4n-donate-system-2.0-plugin-sdk";
import { createOfficialCatalog, createPaymentRegistry } from "./catalog.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const manifests = [
  ["ecpay", ecpay],
  ["ecpay-atm", ecpayAtm],
  ["ecpay-cvs", ecpayCvs],
  ["ecpay-barcode", ecpayBarcode],
  ["opay", opay],
  ["opay-atm", opayAtm],
  ["opay-cvs", opayCvs],
  ["alerts", alerts],
  ["chat-overlay", chatOverlay],
  ["twitch-chat", twitchChat],
  ["goals", goals],
  ["ticker", ticker],
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
  for (const manifest of [ecpay, ecpayAtm, ecpayCvs, ecpayBarcode, opay, opayAtm, opayCvs]) {
    const secrets = secretFieldKeys(manifest.settingsSchema);
    assert.deepEqual(secrets.sort(), ["hashIv", "hashKey", "merchantId"]);
    assert.deepEqual(publicFieldKeys(manifest.settingsSchema), ["environment"]);
    assert.equal(hasPluginSettingsNav(manifest), true);
  }
  for (const manifest of [alerts, goals, ticker, chatOverlay]) {
    assert.deepEqual(secretFieldKeys(manifest.settingsSchema), []);
    assert.equal(publicFieldKeys(manifest.settingsSchema).length > 0, true);
    assert.equal(hasPluginSettingsNav(manifest), true);
  }
  assert.deepEqual(secretFieldKeys(twitchChat.settingsSchema).sort(), ["clientId", "clientSecret"]);
  assert.deepEqual(publicFieldKeys(twitchChat.settingsSchema), ["channel"]);
  assert.equal(hasPluginSettingsNav(twitchChat), true);
  assert.equal(alerts.overlaySlot?.width, 0.36);
  assert.equal(chatOverlay.overlaySlot?.x, 0.66);
  assert.equal(goals.overlaySlot?.y, 0.04);
  assert.equal(ticker.overlaySlot?.y, 0.22);
  assert.equal(goals.version, "0.1.1");
  assert.equal("creditedOnly" in goals.settingsSchema.properties, false);
  assert.equal(ticker.version, "0.1.0");
  assert.equal(alerts.version, "0.3.0");
  const secretOnly = parseManifest({
    id: "official.secret-only",
    name: "只有密文",
    version: "0.0.0",
    api: "0.1",
    kind: ["connector"],
    permissions: ["secrets"],
    entry: { worker: "./src/index.ts" },
    settingsSchema: {
      type: "object",
      properties: { token: { type: "string", "x-s4n-secret": true, title: "權杖" } },
    },
  });
  assert.deepEqual(publicFieldKeys(secretOnly.settingsSchema), []);
  assert.equal(hasPluginSettingsNav(secretOnly), false);
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

test("the official catalog loads one provider per payment method and the twitch source", () => {
  const catalog = createOfficialCatalog();
  assert.equal(catalog.length, 12);
  assert.equal(catalog.some((plugin) => plugin.manifest.id === "official.tts"), false);
  assert.equal(catalog.some((plugin) => plugin.manifest.id === "official.chat-overlay" && plugin.createChatSource === undefined), true);
  assert.equal(catalog.some((plugin) => plugin.manifest.id === "official.twitch-chat" && plugin.createChatSource !== undefined), true);
  const parked = parseManifest(
    JSON.parse(readFileSync(resolve(root, "plugins", "opay-barcode", "s4n-plugin.json"), "utf8")),
  );
  assert.equal(parked.id, "official.opay-barcode");
  assert.equal(catalog.some((plugin) => plugin.manifest.id === "official.opay-barcode"), false);
  assert.deepEqual(createPaymentRegistry(catalog).ids().sort(), [
    "official.ecpay",
    "official.ecpay-atm",
    "official.ecpay-barcode",
    "official.ecpay-cvs",
    "official.opay",
    "official.opay-atm",
    "official.opay-cvs",
  ]);
});
