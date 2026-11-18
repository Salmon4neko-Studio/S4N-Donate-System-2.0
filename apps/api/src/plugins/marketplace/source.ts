import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyEnvelope, type VerifyFailure } from "./verify.js";
import type { RegistryPlugin, RegistrySource, RegistrySourceId } from "./types.js";

export interface LoadedRegistry {
  ok: true;
  issuedAt: string;
  entries: Array<RegistryPlugin & { source: RegistrySourceId }>;
}

export type LoadRegistryResult = LoadedRegistry | { ok: false; reason: VerifyFailure };

export function officialRegistryPath(): string {
  return resolve(import.meta.dirname, "../../../registry/official.json");
}

export function createFileSource(id: RegistrySourceId, path: string): RegistrySource {
  return {
    id,
    async read() {
      try {
        return await readFile(path);
      } catch {
        return null;
      }
    },
  };
}

export function createMemorySource(id: RegistrySourceId, bytes: Uint8Array | null): RegistrySource {
  return {
    id,
    async read() {
      return bytes;
    },
  };
}

export function createEmptyCommunitySource(): RegistrySource {
  return createMemorySource("community", null);
}

/**
 * Official bytes must verify with the pinned key.
 * An empty community source is a valid adapter with nothing to install.
 * Community bytes, when a later adapter supplies them, still use the pinned key.
 */
export async function loadSource(source: RegistrySource, publicKeySpki: string): Promise<LoadRegistryResult> {
  const bytes = await source.read();
  if (bytes === null || bytes.byteLength === 0) {
    if (source.id === "community") return { ok: true, issuedAt: "", entries: [] };
    return { ok: false, reason: "unsigned" };
  }
  const verified = verifyEnvelope(bytes, publicKeySpki);
  if (!verified.ok) return verified;
  return {
    ok: true,
    issuedAt: verified.index.issuedAt,
    entries: verified.index.plugins.map((plugin) => ({ ...plugin, source: source.id })),
  };
}

export function mergeEntries(
  official: Array<RegistryPlugin & { source: RegistrySourceId }>,
  community: Array<RegistryPlugin & { source: RegistrySourceId }>,
): Array<RegistryPlugin & { source: RegistrySourceId }> {
  const ids = new Set(official.map((entry) => entry.id));
  return [...official, ...community.filter((entry) => !ids.has(entry.id))];
}
