import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface SealedSecret {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
}

/** Binds a ciphertext to one plugin field so it cannot be swapped onto another. */
export function secretAad(pluginId: string, fieldKey: string): string {
  return `s4n.plugin-setting:${pluginId}:${fieldKey}`;
}

export function sealSecret(plaintext: string, key: Buffer, aad: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function openSecret(sealed: SealedSecret, key: Buffer, aad: string): string {
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}
