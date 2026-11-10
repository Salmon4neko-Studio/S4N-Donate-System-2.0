import { openSecret, secretAad } from "../crypto/secret-box.js";
import type { SecretStore } from "./settings.js";

/**
 * Decrypts plugin secrets into memory for signing or verification.
 * Do not call this from a handler that serializes its return value to the dashboard.
 */
export async function decryptPluginSecrets(
  pluginId: string,
  store: SecretStore,
  masterKey: Buffer,
): Promise<Record<string, string>> {
  const sealed = await store.readSealed(pluginId);
  const secrets: Record<string, string> = {};
  for (const [fieldKey, blob] of Object.entries(sealed)) {
    secrets[fieldKey] = openSecret(blob, masterKey, secretAad(pluginId, fieldKey));
  }
  return secrets;
}
