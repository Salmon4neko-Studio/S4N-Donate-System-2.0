import assert from "node:assert/strict";
import { test } from "node:test";
import { openSecret, secretAad } from "../crypto/secret-box.js";
import { redactSettings } from "./settings.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

const sentinel = {
  merchantId: "sentinel-merchant-9f3a",
  hashKey: "sentinel-hash-key-9f3a",
  hashIv: "sentinel-hash-iv-9f3a",
};

test("saving plugin settings returns redacted fields and keeps secrets sealed", async () => {
  const { app, secrets, masterKey } = createTestApp();
  const cookie = await setupOperator(app);
  const response = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: {
      origin: TEST_ORIGIN,
      cookie,
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

  const read = await app.request("/api/plugins/official.ecpay/settings", { headers: { cookie } });
  const readBody = await read.json();
  const readText = JSON.stringify(readBody);
  assert.equal(readText.includes(sentinel.hashKey), false);
  assert.equal(readText.includes("ciphertext"), false);
  const sealedBytes = Buffer.from(stored.ciphertext).toString("base64");
  assert.equal(readText.includes(sealedBytes), false);
});

test("secret settings never leak plaintext or ciphertext", async () => {
  const { app } = createTestApp();
  const cookie = await setupOperator(app);
  const saved = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: {
      origin: TEST_ORIGIN,
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: { ...sentinel, environment: "stage" } }),
  });
  const savedText = JSON.stringify(await saved.json());
  const listed = await app.request("/api/plugins", { headers: { cookie } });
  const listedText = JSON.stringify(await listed.json());
  for (const value of Object.values(sentinel)) {
    assert.equal(savedText.includes(value), false);
    assert.equal(listedText.includes(value), false);
  }
  assert.equal(savedText.includes("ciphertext"), false);
  assert.equal(listedText.includes("ciphertext"), false);
});

test("a missing or foreign origin cannot write settings", async () => {
  const { app } = createTestApp();
  const cookie = await setupOperator(app);
  const missing = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ values: {} }),
  });
  assert.equal(missing.status, 403);

  const foreign = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers: {
      origin: "https://evil.example",
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: {} }),
  });
  assert.equal(foreign.status, 403);

  const anonymous = await app.request("/api/plugins/official.ecpay/settings");
  assert.equal(anonymous.status, 401);
});

test("public and secret settings save on their own sides", async () => {
  const { app, secrets, masterKey } = createTestApp();
  const cookie = await setupOperator(app);
  const headers = {
    origin: TEST_ORIGIN,
    cookie,
    "content-type": "application/json",
  };

  const environmentOnly = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { environment: "production" } }),
  });
  const environmentBody = (await environmentOnly.json()) as {
    publicFields: Array<{ key: string; value?: string; secret: boolean }>;
    secretFields: Array<{ key: string; configured: boolean; secret: boolean; value?: string }>;
  };
  assert.equal(environmentOnly.status, 200);
  assert.equal(environmentBody.publicFields.find((field) => field.key === "environment")?.value, "production");
  assert.equal(environmentBody.secretFields.every((field) => field.configured === false && field.value === undefined), true);

  const oneSecret = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { merchantId: sentinel.merchantId } }),
  });
  assert.equal(oneSecret.status, 422);

  const secretsOnly = await app.request("/api/plugins/official.ecpay/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: sentinel }),
  });
  const secretsBody = (await secretsOnly.json()) as {
    publicFields: Array<{ key: string; value?: string }>;
    secretFields: Array<{ key: string; configured: boolean; value?: string }>;
  };
  const secretsText = JSON.stringify(secretsBody);
  assert.equal(secretsOnly.status, 200);
  assert.equal(secretsBody.publicFields.find((field) => field.key === "environment")?.value, "production");
  assert.equal(secretsBody.secretFields.every((field) => field.configured && field.value === undefined), true);
  for (const value of Object.values(sentinel)) {
    assert.equal(secretsText.includes(value), false);
  }
  assert.equal(
    openSecret(
      (await secrets.readSealed("official.ecpay")).hashKey!,
      masterKey,
      secretAad("official.ecpay", "hashKey"),
    ),
    sentinel.hashKey,
  );

  const listed = await app.request("/api/plugins", { headers: { cookie } });
  const plugins = ((await listed.json()) as { plugins: Array<{ id: string; settingsNav: boolean; enabled: boolean }> }).plugins;
  assert.equal(plugins.find((plugin) => plugin.id === "official.alerts")?.settingsNav, true);
  assert.equal(plugins.find((plugin) => plugin.id === "official.ecpay")?.settingsNav, true);
  assert.equal(plugins.find((plugin) => plugin.id === "official.alerts")?.enabled, false);
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

test("alert color fields accept hex and reject other colors", async () => {
  const { app } = createTestApp();
  const cookie = await setupOperator(app);
  const headers = {
    origin: TEST_ORIGIN,
    cookie,
    "content-type": "application/json",
  };

  const named = await app.request("/api/plugins/official.alerts/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { titleColor: "red", primaryColor: "#F28500" } }),
  });
  assert.equal(named.status, 422);

  const wide = await app.request("/api/plugins/official.alerts/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { primaryColor: "#ffff" } }),
  });
  assert.equal(wide.status, 422);

  const saved = await app.request("/api/plugins/official.alerts/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { titleColor: "#abc", primaryColor: "#F28500", durationMs: 4000 } }),
  });
  assert.equal(saved.status, 200);
  const body = (await saved.json()) as {
    publicFields: Array<{ key: string; value?: string | number; color?: boolean }>;
  };
  assert.equal(body.publicFields.find((field) => field.key === "titleColor")?.value, "#abc");
  assert.equal(body.publicFields.find((field) => field.key === "titleColor")?.color, true);
  assert.equal(body.publicFields.find((field) => field.key === "primaryColor")?.value, "#F28500");
  assert.equal(body.publicFields.find((field) => field.key === "durationMs")?.value, 4000);

  const legacy = await app.request("/api/plugins/official.alerts/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: { durationMs: 8000 } }),
  });
  assert.equal(legacy.status, 200);
  const legacyBody = (await legacy.json()) as { publicFields: Array<{ key: string; value?: string | number }> };
  assert.equal(legacyBody.publicFields.find((field) => field.key === "durationMs")?.value, 8000);
  assert.equal(legacyBody.publicFields.find((field) => field.key === "titleColor")?.value, "#abc");
});
