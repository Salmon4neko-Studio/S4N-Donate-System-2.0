import type {
  ChatClearPayload,
  ChatDeletePayload,
  ChatMessagePayload,
  ChatPlatform,
} from "s4n-donate-system-2.0-events";

/**
 * What the core hands a chat source.
 * Sources emit the normalized events from `s4n-donate-system-2.0-events`.
 * The chat display plugin subscribes to those events and does not import a source,
 * so a later YouTube source can be registered without changing the display plugin.
 */
export interface ChatSourceHost {
  emitMessage(payload: ChatMessagePayload): void;
  emitDelete(payload: ChatDeletePayload): void;
  emitClear(payload: ChatClearPayload): void;
}

export interface ChatSourceSettings {
  /** Non-secret settings from the plugin manifest. */
  publicSettings: Record<string, string | number | boolean>;
  /**
   * Decrypted secrets, for this process only.
   * Never copy these onto an overlay URL, a log line, or a browser response.
   */
  secrets: Record<string, string>;
}

/**
 * One platform connector. `official.twitch-chat` is the v1 implementation.
 * A YouTube plugin implements the same interface and emits the same events.
 */
export interface ChatSource {
  readonly pluginId: string;
  readonly platform: ChatPlatform;
  start(host: ChatSourceHost): void;
  stop(): void;
  applySettings(settings: ChatSourceSettings): void;
}
