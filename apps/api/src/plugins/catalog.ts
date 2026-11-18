import { manifest as alerts } from "@s4n/plugin-alerts";
import { manifest as chatOverlay } from "@s4n/plugin-chat-overlay";
import { createProvider as createEcpay, manifest as ecpay } from "@s4n/plugin-ecpay";
import { manifest as goals } from "@s4n/plugin-goals";
import { createProvider as createOpay, manifest as opay } from "@s4n/plugin-opay";
import { manifest as ticker } from "@s4n/plugin-ticker";
import { createTwitchChatSource, manifest as twitchChat } from "@s4n/plugin-twitch-chat";
import { manifest as tts } from "@s4n/plugin-tts";
import {
  assertManifestCoherent,
  assertPermissionsAllowed,
  type ChatSource,
  type PaymentProvider,
  type PluginManifest,
} from "@s4n/plugin-sdk";
import { OFFICIAL_PLUGIN_IDS, PAYMENT_PLUGIN_IDS, isOfficialPluginId } from "./official.js";

export interface LoadedPlugin {
  manifest: PluginManifest;
  createProvider?: () => PaymentProvider;
  /** Platform chat connector. The display plugin is not one of these. */
  createChatSource?: () => ChatSource;
}

const PAYMENT_IDS = new Set<string>(PAYMENT_PLUGIN_IDS);

export function createOfficialCatalog(): LoadedPlugin[] {
  const plugins: LoadedPlugin[] = [
    { manifest: ecpay, createProvider: createEcpay },
    { manifest: opay, createProvider: createOpay },
    { manifest: alerts },
    { manifest: chatOverlay },
    { manifest: twitchChat, createChatSource: createTwitchChatSource },
    { manifest: goals },
    { manifest: ticker },
    { manifest: tts },
  ];

  for (const plugin of plugins) {
    assertManifestCoherent(plugin.manifest);
    assertPermissionsAllowed(plugin.manifest.id, plugin.manifest.permissions, OFFICIAL_PLUGIN_IDS);
    if (!isOfficialPluginId(plugin.manifest.id)) {
      throw new Error(`Refusing to load ${plugin.manifest.id}; it is not on the official allowlist`);
    }
    if (plugin.manifest.kind.includes("payment") && !PAYMENT_IDS.has(plugin.manifest.id)) {
      throw new Error(`Only ECPay and O'Pay may implement payment (${plugin.manifest.id})`);
    }
  }

  return plugins;
}

export class PaymentRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  register(provider: PaymentProvider): void {
    if (this.providers.has(provider.pluginId)) {
      throw new Error(`Duplicate payment provider ${provider.pluginId}`);
    }
    this.providers.set(provider.pluginId, provider);
  }

  get(id: string): PaymentProvider | undefined {
    return this.providers.get(id);
  }

  ids(): string[] {
    return [...this.providers.keys()];
  }
}

export function createPaymentRegistry(catalog: readonly LoadedPlugin[]): PaymentRegistry {
  const registry = new PaymentRegistry();
  for (const plugin of catalog) {
    if (plugin.createProvider === undefined) continue;
    const provider = plugin.createProvider();
    if (provider.pluginId !== plugin.manifest.id) {
      throw new Error(
        `Provider id ${provider.pluginId} does not match manifest ${plugin.manifest.id}`,
      );
    }
    registry.register(provider);
  }
  return registry;
}
