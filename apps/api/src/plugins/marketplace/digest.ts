import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Digest of the logical manifest. Whitespace and key order are ignored. */
export function digestManifest(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalJson(value), "utf8"));
}
