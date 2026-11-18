import type { ChatSource, ChatSourceHost, ChatSourceSettings } from "@s4n/plugin-sdk";
import { createBadgeCache, type HelixCredentials } from "./badges.js";
import { normalizeChannel } from "./irc.js";
import { TWITCH_CHAT_PLUGIN_ID } from "./manifest.js";
import { createTwitchChatSession, type LineSocket } from "./session.js";
import { connectIrcWebSocket } from "./socket.js";

export function createTwitchChatSource(options?: { connect?: () => LineSocket }): ChatSource {
  let host: ChatSourceHost | null = null;
  let running = false;
  let channel = "";
  let credentials: HelixCredentials | null = null;
  let session: ReturnType<typeof createTwitchChatSession> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const cache = createBadgeCache({});

  function ensureSession(): void {
    if (session !== null) return;
    session = createTwitchChatSession({
      channel,
      connect: options?.connect ?? (() => connectIrcWebSocket()),
      badge: (roomId, setId, version) => cache.lookup(roomId, setId, version),
      onMessage: (message) => host?.emitMessage(message),
      onDelete: (event) => host?.emitDelete(event),
      onClear: (event) => host?.emitClear(event),
      onRoom: (roomId) => {
        if (credentials !== null) void cache.refresh(credentials, roomId);
      },
    });
  }

  function refreshGlobal(): void {
    if (credentials !== null) void cache.refresh(credentials, null);
  }

  return {
    pluginId: TWITCH_CHAT_PLUGIN_ID,
    platform: "twitch",
    start(nextHost) {
      host = nextHost;
      running = true;
      ensureSession();
      session?.applyChannel(channel);
      if (channel !== "") session?.start();
      if (timer === null) {
        timer = setInterval(refreshGlobal, 30 * 60 * 1000);
        timer.unref?.();
      }
      refreshGlobal();
    },
    stop() {
      running = false;
      session?.stop();
      session = null;
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    applySettings(settings: ChatSourceSettings) {
      channel = normalizeChannel(stringSetting(settings.publicSettings.channel));
      const clientId = settings.secrets.clientId?.trim() ?? "";
      const clientSecret = settings.secrets.clientSecret?.trim() ?? "";
      credentials = clientId !== "" && clientSecret !== "" ? { clientId, clientSecret } : null;
      if (!running) return;
      ensureSession();
      session?.applyChannel(channel);
      if (channel === "") session?.stop();
      else session?.start();
      refreshGlobal();
    },
  };
}

function stringSetting(value: string | number | boolean | undefined): string {
  return typeof value === "string" ? value : "";
}
