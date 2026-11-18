import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { digestManifest } from "./digest.js";

export const BUNDLED_PLUGIN_FILES: Record<string, string> = {
  "official.ecpay": "plugins/ecpay/s4n-plugin.json",
  "official.opay": "plugins/opay/s4n-plugin.json",
  "official.alerts": "plugins/alerts/s4n-plugin.json",
  "official.chat-overlay": "plugins/chat-overlay/s4n-plugin.json",
  "official.twitch-chat": "plugins/twitch-chat/s4n-plugin.json",
  "official.goals": "plugins/goals/s4n-plugin.json",
  "official.ticker": "plugins/ticker/s4n-plugin.json",
  "official.tts": "plugins/tts/s4n-plugin.json",
};

export function repoRoot(): string {
  return resolve(import.meta.dirname, "../../../../../");
}

export function readBundledManifest(pluginId: string, root = repoRoot()): { version: string; digest: string } {
  const relative = BUNDLED_PLUGIN_FILES[pluginId];
  if (relative === undefined) throw new Error("not bundled");
  const parsed = JSON.parse(readFileSync(resolve(root, relative), "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string") throw new Error("manifest version");
  return { version: parsed.version, digest: digestManifest(parsed) };
}
