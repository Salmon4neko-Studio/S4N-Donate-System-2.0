import type { DonationSucceededPayload, DonationTestPayload } from "@s4n/events";
import { donationAsChatMessage, parseChatOverlaySettings, CHAT_OVERLAY_PLUGIN_ID } from "@s4n/plugin-chat-overlay";
import { createPluginBus, type ChatSource, type ChatSourceHost } from "@s4n/plugin-sdk";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { LoadedPlugin } from "../plugins/catalog.js";
import type { InstallationStore } from "../plugins/installations.js";
import type { SecretStore } from "../plugins/settings.js";
import type { CoreBus } from "../realtime/bus.js";

export interface ChatHostDeps {
  catalog: readonly LoadedPlugin[];
  installations: InstallationStore;
  secrets: SecretStore;
  masterKey: Buffer;
  bus: CoreBus;
}

/**
 * Starts enabled chat-source plugins and, when the display setting allows it,
 * copies donation events into chat. Copying does not write the ledger.
 * Test donations stay `donation.test: true`.
 */
export function createChatHost(deps: ChatHostDeps): { sync(): Promise<void>; stop(): void } {
  const sources = new Map<string, ChatSource>();
  const pluginBus = createPluginBus({
    publish(type, payload) {
      deps.bus.publish(type, payload);
    },
    subscribe(type, handler) {
      return deps.bus.subscribe((event) => {
        if (event.type === type) handler(event as never);
      });
    },
  });
  const chatHost: ChatSourceHost = {
    emitMessage(payload) {
      pluginBus.emit("s4n.chat.message", payload);
    },
    emitDelete(payload) {
      pluginBus.emit("s4n.chat.delete", payload);
    },
    emitClear(payload) {
      pluginBus.emit("s4n.chat.clear", payload);
    },
  };

  const unsubscribe = deps.bus.subscribe((event) => {
    if (event.type !== "s4n.donation.succeeded" && event.type !== "s4n.donation.test") return;
    void mixDonation(event.payload, event.occurredAt);
  });

  async function mixDonation(payload: DonationSucceededPayload | DonationTestPayload, occurredAt: string): Promise<void> {
    try {
      const enabled = await deps.installations.enabledIds();
      if (!enabled.has(CHAT_OVERLAY_PLUGIN_ID)) return;
      const settings = parseChatOverlaySettings(
        await deps.secrets.readPublicSettings(CHAT_OVERLAY_PLUGIN_ID),
      );
      if (!settings.mixDonations) return;
      deps.bus.publish("s4n.chat.message", donationAsChatMessage(payload, occurredAt));
    } catch {
      // A settings read failure must not block the original donation event.
    }
  }

  return {
    async sync() {
      try {
        const enabled = await deps.installations.enabledIds();
        for (const plugin of deps.catalog) {
          if (plugin.createChatSource === undefined) continue;
          const id = plugin.manifest.id;
          if (!enabled.has(id)) {
            sources.get(id)?.stop();
            sources.delete(id);
            continue;
          }
          let source = sources.get(id);
          if (source === undefined) {
            source = plugin.createChatSource();
            sources.set(id, source);
            source.start(chatHost);
          }
          const publicSettings = await deps.secrets.readPublicSettings(id);
          let secretValues: Record<string, string> = {};
          try {
            secretValues = await decryptPluginSecrets(id, deps.secrets, deps.masterKey);
          } catch {
            secretValues = {};
          }
          source.applySettings({ publicSettings, secrets: secretValues });
        }
      } catch {
        // The next sync retries. Chat must not take down the API.
      }
    },
    stop() {
      unsubscribe();
      for (const source of sources.values()) source.stop();
      sources.clear();
    },
  };
}
