import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalJson } from "./canonical.js";
import { digestManifest } from "./digest.js";
import { BUNDLED_PLUGIN_FILES, readBundledManifest, repoRoot } from "./packages.js";
import { OFFICIAL_REGISTRY_PUBLIC_KEY } from "./pinned-key.js";
import { resolve } from "node:path";
import { generateEd25519, signMessage } from "./signature.js";
import { verifyEnvelope } from "./verify.js";
import type { RegistryIndex } from "./types.js";

const sampleIndex = {
  format: "s4n-registry-index",
  version: 1,
  issuedAt: "2026-11-18T07:00:00.000Z",
  plugins: [
    {
      id: "official.alerts",
      name: "贊助提醒",
      version: "0.1.0",
      api: "0.1",
      category: "overlay",
      author: "S4N",
      official: true,
      description: "在疊層顯示贊助。",
      icon: "bell",
      permissions: ["events.subscribe", "overlay.slot"],
      kind: ["overlay"],
      changelog: "初版",
      compatibility: { core: "0.1", pluginSpec: "0.1" },
      sha256: "ab".repeat(32),
      featured: true,
      screenshots: [{ alt: "提醒卡", caption: "疊層", frame: "overlay" }],
    },
  ],
} satisfies RegistryIndex;

test("a signed index verifies", () => {
  const keys = generateEd25519();
  const bytes = envelope(sampleIndex, keys.privateKeyPem);
  const result = verifyEnvelope(bytes, keys.publicKeySpki);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.index.plugins[0]?.id, "official.alerts");
});

test("a tampered index is rejected", () => {
  const keys = generateEd25519();
  const signed = JSON.parse(Buffer.from(envelope(sampleIndex, keys.privateKeyPem)).toString("utf8")) as {
    index: RegistryIndex;
    signature: string;
  };
  signed.index.plugins[0]!.name = "被改過的名字";
  const result = verifyEnvelope(Buffer.from(JSON.stringify(signed)), keys.publicKeySpki);
  assert.deepEqual(result, { ok: false, reason: "invalid_signature" });
});

test("an unsigned index is rejected", () => {
  const keys = generateEd25519();
  const bytes = Buffer.from(JSON.stringify({ index: sampleIndex }));
  assert.deepEqual(verifyEnvelope(bytes, keys.publicKeySpki), { ok: false, reason: "unsigned" });
  const emptySignature = Buffer.from(JSON.stringify({ index: sampleIndex, signature: "" }));
  assert.deepEqual(verifyEnvelope(emptySignature, keys.publicKeySpki), { ok: false, reason: "unsigned" });
});

test("a signature from the wrong key is rejected", () => {
  const signer = generateEd25519();
  const other = generateEd25519();
  const bytes = envelope(sampleIndex, signer.privateKeyPem);
  assert.deepEqual(verifyEnvelope(bytes, other.publicKeySpki), { ok: false, reason: "invalid_signature" });
});

test("the committed official registry matches the pinned key and bundled manifests", () => {
  const bytes = readFileSync(resolve(repoRoot(), "apps/api/registry/official.json"));
  const result = verifyEnvelope(bytes, OFFICIAL_REGISTRY_PUBLIC_KEY);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.index.plugins.map((plugin) => plugin.id).sort(),
    Object.keys(BUNDLED_PLUGIN_FILES).sort(),
  );
  for (const plugin of result.index.plugins) {
    const bundled = readBundledManifest(plugin.id);
    assert.equal(plugin.sha256, bundled.digest);
    assert.equal(plugin.version, bundled.version);
    assert.equal(plugin.official, true);
    assert.equal(plugin.sha256, digestManifest(JSON.parse(readFileSync(resolve(repoRoot(), BUNDLED_PLUGIN_FILES[plugin.id]!), "utf8"))));
  }
});

test("package digest changes when the manifest changes", () => {
  const original = digestManifest({ id: "official.alerts", version: "0.1.0" });
  const tampered = digestManifest({ id: "official.alerts", version: "0.1.1" });
  assert.notEqual(original, tampered);
  assert.equal(original, digestManifest({ version: "0.1.0", id: "official.alerts" }));
});

function envelope(index: RegistryIndex, privateKeyPem: string): Uint8Array {
  const signature = signMessage(Buffer.from(canonicalJson(index), "utf8"), privateKeyPem).toString("base64");
  return Buffer.from(JSON.stringify({ index, signature }));
}
