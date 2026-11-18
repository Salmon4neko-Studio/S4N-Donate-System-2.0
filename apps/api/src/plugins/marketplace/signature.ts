import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function generateEd25519(): { publicKeySpki: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeySpki: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signMessage(message: Uint8Array, privateKeyPem: string): Buffer {
  const key = createPrivateKey(privateKeyPem);
  return sign(null, message, key);
}

/**
 * Ed25519 verify. A malformed key or signature is a failed check, not an exception
 * the caller has to treat as success.
 */
export function verifyMessage(message: Uint8Array, signature: Uint8Array, publicKeySpki: string): boolean {
  if (!isSpki(publicKeySpki) || signature.byteLength !== 64) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeySpki, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}

function isSpki(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.byteLength === 44 && bytes.subarray(0, SPKI_PREFIX.byteLength).equals(SPKI_PREFIX);
}
