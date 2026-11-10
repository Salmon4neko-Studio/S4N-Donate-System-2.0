import type { RuntimeEnv } from "../env.js";

const KEY_BYTES = 32;

/** 32 zero bytes, standard base64. Public development placeholder. */
export const DEV_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export function parseMasterKey(raw: string, env: RuntimeEnv): Buffer {
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    throw new Error("S4N_MASTER_KEY must be standard base64");
  }

  const key = Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("S4N_MASTER_KEY must decode to exactly 32 bytes");
  }

  if (env === "production" && key.equals(Buffer.alloc(KEY_BYTES))) {
    throw new Error("Refusing the all-zero S4N_MASTER_KEY in production");
  }

  return key;
}
