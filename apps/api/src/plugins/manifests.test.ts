import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { manifest as alerts } from "@s4n/plugin-alerts";
import { manifest as ecpay } from "@s4n/plugin-ecpay";
import { manifest as goals } from "@s4n/plugin-goals";
import { manifest as opay } from "@s4n/plugin-opay";
import { manifest as ticker } from "@s4n/plugin-ticker";
import { manifest as tts } from "@s4n/plugin-tts";
import { parseManifest, secretFieldKeys } from "@s4n/plugin-sdk";
import { createOfficialCatalog, createPaymentRegistry } from "./catalog.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const manifests = [
  ["ecpay", ecpay],
  ["opay", opay],
  ["alerts", alerts],
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
  for (const manifest of [alerts, goals, ticker, tts]) {
    assert.deepEqual(secretFieldKeys(manifest.settingsSchema), []);
  }
});

test("the official catalog loads two payment providers", () => {
  const catalog = createOfficialCatalog();
  assert.equal(catalog.length, 6);
  assert.deepEqual(createPaymentRegistry(catalog).ids().sort(), ["official.ecpay", "official.opay"]);
});
