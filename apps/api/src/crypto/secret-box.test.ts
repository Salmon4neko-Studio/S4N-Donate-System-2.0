import assert from "node:assert/strict";
import { test } from "node:test";
import { openSecret, sealSecret, secretAad } from "./secret-box.js";

const key = Buffer.alloc(32, 4);
const plaintext = "sentinel-hash-key-9f3a";

test("seals and opens a plugin secret", () => {
  const aad = secretAad("official.ecpay", "hashKey");
  const sealed = sealSecret(plaintext, key, aad);
  assert.equal(Buffer.from(sealed.ciphertext).includes(Buffer.from(plaintext)), false);
  assert.equal(openSecret(sealed, key, aad), plaintext);
});

test("rejects a swapped field, a wrong key, and a tampered ciphertext", () => {
  const sealed = sealSecret(plaintext, key, secretAad("official.ecpay", "hashKey"));
  assert.throws(() => openSecret(sealed, key, secretAad("official.opay", "hashKey")));
  assert.throws(() => openSecret(sealed, Buffer.alloc(32, 5), secretAad("official.ecpay", "hashKey")));
  const tampered = {
    ...sealed,
    ciphertext: Uint8Array.from(sealed.ciphertext, (byte, index) => (index === 0 ? byte ^ 0xff : byte)),
  };
  assert.throws(() => openSecret(tampered, key, secretAad("official.ecpay", "hashKey")));
});
