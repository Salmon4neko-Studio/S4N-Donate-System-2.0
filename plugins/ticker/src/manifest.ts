import type { PluginManifest } from "@s4n/plugin-sdk";

export const manifest = {
  "id": "official.ticker",
  "name": "跑馬燈",
  "version": "0.0.0",
  "api": "0.1",
  "description": "跑馬燈的佔位。尚未捲動文字。",
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
      "speed": {
        "type": "string",
        "title": "速度",
        "enum": [
          "slow",
          "medium"
        ]
      }
    }
  }
} as const satisfies PluginManifest;
