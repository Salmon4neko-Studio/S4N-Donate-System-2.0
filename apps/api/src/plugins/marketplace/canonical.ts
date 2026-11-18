/**
 * Stable UTF-8 JSON for signatures and package digests.
 * Key order in the file does not matter. Forbidden keys are rejected.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CanonicalError("non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalError("unsupported object");
    }
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new CanonicalError("forbidden key");
      }
      sorted[key] = normalize(record[key]);
    }
    return sorted;
  }
  throw new CanonicalError("unsupported value");
}

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}
