import { randomBytes } from "node:crypto";
import { argon2Verify, argon2id } from "hash-wasm";
import { PASSWORD_HASH } from "./constants.js";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const encoded = await argon2id({
    password,
    salt,
    parallelism: PASSWORD_HASH.parallelism,
    iterations: PASSWORD_HASH.timeCost,
    memorySize: PASSWORD_HASH.memoryKiB,
    hashLength: 32,
    outputType: "encoded",
  });
  const marker = `m=${PASSWORD_HASH.memoryKiB},t=${PASSWORD_HASH.timeCost},p=${PASSWORD_HASH.parallelism}`;
  if (!encoded.startsWith("$argon2id$") || !encoded.includes(marker)) {
    throw new Error("unexpected password hash parameters");
  }
  return encoded;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: encoded });
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Real Argon2id hash used when the email does not exist, so login timing stays even. */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("s4n-dummy-password-not-a-login");
  return dummyHash;
}
