import type { PluginManifest } from "@s4n/plugin-sdk";

export const manifest = {
  "id": "official.alerts",
  "name": "贊助提醒",
  "version": "0.0.0",
  "api": "0.1",
  "description": "在疊層顯示贊助人、金額與留言。沒有動畫序列。",
  "kind": [
    "overlay"
  ],
  "permissions": [
    "events.subscribe",
    "overlay.slot"
  ],
  "entry": {
    "overlay": "./src/index.ts"
  },
  "settingsSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "durationMs": {
        "type": "integer",
        "title": "顯示時間（毫秒）",
        "minimum": 1000
      }
    }
  }
} as const satisfies PluginManifest;
