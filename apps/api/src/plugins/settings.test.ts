import assert from "node:assert/strict";
import { test } from "node:test";
import { openSecret, secretAad } from "../crypto/secret-box.js";
import { redactSettings } from "./settings.js";
import { createTestApp } from "../test/fixture.js";

const sentinel = {
  merchantId: "sentinel-merchant-9f3a",
  hashKey: "sentinel-hash-key-9f3a",
  hashIv: "sentinel-hash-iv-9f3a",
};

test("saving plugin settings returns redacted fields and keeps secrets sealed", async () => {
  const { app, secrets, masterKey } = createTestApp();
  const response = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: {
      origin: "http://localhost:5180",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      values: { ...sentinel, environment: "stage" },
    }),
  });
  const body = (await response.json()) as {
    fields: Array<{ key: string; secret: boolean; configured: boolean; value?: string }>;
  };
  const encoded = JSON.stringify(body);
  assert.equal(response.status, 200);
  for (const value of Object.values(sentinel)) {
    assert.equal(encoded.includes(value), false);
  }

  const fields = body.fields;
  const hashKey = fields.find((field) => field.key === "hashKey");
  const environment = fields.find((field) => field.key === "environment");
  assert.equal(hashKey?.secret, true);
  assert.equal(hashKey?.configured, true);
  assert.equal(hashKey?.value, undefined);
  assert.equal(environment?.value, "stage");

  const sealed = await secrets.readSealed("official.ecpay");
  const stored = sealed.hashKey;
  assert.ok(stored);
  assert.equal(Buffer.from(stored.ciphertext).includes(Buffer.from(sentinel.hashKey)), false);
  assert.equal(
    openSecret(stored, masterKey, secretAad("official.ecpay", "hashKey")),
    sentinel.hashKey,
  );

  const read = await app.request("/api/plugins/official.ecpay/settings");
  const readBody = await read.json();
  assert.equal(JSON.stringify(readBody).includes(sentinel.hashKey), false);
});

test("a missing or foreign origin cannot write settings", async () => {
  const { app } = createTestApp();
  const missing = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: {} }),
  });
  assert.equal(missing.status, 403);

  const foreign = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: {} }),
  });
  assert.equal(foreign.status, 403);
});

test("redaction drops a secret even if it was placed in public settings", () => {
  const redacted = redactSettings(
    {
      type: "object",
      properties: {
        hashKey: { type: "string", "x-s4n-secret": true },
        environment: { type: "string" },
      },
    },
    { hashKey: "sentinel-hash-key-9f3a", environment: "stage" },
    ["hashKey"],
  );
  assert.equal(JSON.stringify(redacted).includes("sentinel-hash-key-9f3a"), false);
  assert.equal(redacted.find((field) => field.key === "environment")?.value, "stage");
});
