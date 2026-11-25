import { isSecretField } from "s4n-donate-system-2.0-plugin-sdk";
import type { LoadedPlugin } from "../plugins/catalog.js";
import type { InstallationStore } from "../plugins/installations.js";
import type { SecretStore } from "../plugins/settings.js";

export async function paymentMethodReady(
  plugin: LoadedPlugin,
  installations: InstallationStore,
  secrets: SecretStore,
): Promise<boolean> {
  const enabled = (await installations.enabledIds()).has(plugin.manifest.id);
  if (!enabled) return false;
  const [configuredKeys, settings] = await Promise.all([
    secrets.readConfiguredKeys(plugin.manifest.id),
    secrets.readPublicSettings(plugin.manifest.id),
  ]);
  const configured = new Set(configuredKeys);
  for (const key of plugin.manifest.settingsSchema.required ?? []) {
    const field = plugin.manifest.settingsSchema.properties[key];
    if (field === undefined) return false;
    if (isSecretField(field)) {
      if (!configured.has(key)) return false;
      continue;
    }
    if (settings[key] === undefined || settings[key] === "") return false;
  }
  return settings.environment === "stage" || settings.environment === "production";
}
