import type { SealedSecret } from "../crypto/secret-box.js";
import type { SecretStore } from "./settings.js";

interface MemoryPlugin {
  version: string;
  publicSettings: Record<string, string | number | boolean>;
  secrets: Record<string, SealedSecret>;
}

export function createMemorySecretStore(): SecretStore {
  const rows = new Map<string, MemoryPlugin>();

  return {
    persistence: "memory",
    async readConfiguredKeys(pluginId) {
      return Object.keys(rows.get(pluginId)?.secrets ?? {});
    },
    async readPublicSettings(pluginId) {
      return { ...(rows.get(pluginId)?.publicSettings ?? {}) };
    },
    async readSealed(pluginId) {
      const secrets = rows.get(pluginId)?.secrets ?? {};
      return Object.fromEntries(
        Object.entries(secrets).map(([key, sealed]) => [
          key,
          {
            ciphertext: new Uint8Array(sealed.ciphertext),
            iv: new Uint8Array(sealed.iv),
            authTag: new Uint8Array(sealed.authTag),
          },
        ]),
      );
    },
    async write(pluginId, input) {
      const current = rows.get(pluginId);
      rows.set(pluginId, {
        version: input.version,
        publicSettings: { ...input.publicSettings },
        secrets: { ...(current?.secrets ?? {}), ...input.secrets },
      });
    },
  };
}
