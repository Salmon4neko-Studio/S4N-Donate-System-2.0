import { CanonicalError, canonicalJson } from "./canonical.js";
import { RegistryParseError, parseRegistryIndex } from "./parse.js";
import { verifyMessage } from "./signature.js";
import type { RegistryIndex } from "./types.js";

export type VerifyFailure = "unsigned" | "invalid" | "invalid_signature";

export type VerifyResult = { ok: true; index: RegistryIndex } | { ok: false; reason: VerifyFailure };

/**
 * The signature covers the canonical form of the index object.
 * A missing signature is unsigned. A bad signature is rejected whether the
 * bytes were edited or signed by a different key.
 */
export function verifyEnvelope(bytes: Uint8Array, publicKeySpki: string): VerifyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "invalid" };
  const keys = Object.keys(parsed);
  if (keys.some((key) => key !== "index" && key !== "signature")) {
    return { ok: false, reason: "invalid" };
  }
  if (!("signature" in parsed) || parsed.signature === "" || parsed.signature === undefined) {
    return { ok: false, reason: "unsigned" };
  }
  if (typeof parsed.signature !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.signature)) {
    return { ok: false, reason: "unsigned" };
  }
  const signature = Buffer.from(parsed.signature, "base64");
  if (signature.byteLength !== 64 || !("index" in parsed)) {
    return signature.byteLength !== 64 ? { ok: false, reason: "unsigned" } : { ok: false, reason: "invalid" };
  }

  let message: Buffer;
  try {
    message = Buffer.from(canonicalJson(parsed.index), "utf8");
  } catch (error) {
    if (error instanceof CanonicalError) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "invalid" };
  }
  if (!verifyMessage(message, signature, publicKeySpki)) {
    return { ok: false, reason: "invalid_signature" };
  }
  try {
    return { ok: true, index: parseRegistryIndex(parsed.index) };
  } catch (error) {
    if (error instanceof RegistryParseError) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "invalid" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
