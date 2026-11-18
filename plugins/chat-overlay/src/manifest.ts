import type { PluginManifest } from "@s4n/plugin-sdk";

export const CHAT_OVERLAY_PLUGIN_ID = "official.chat-overlay";

export const DEFAULT_BOT_NAMES = "Nightbot\nStreamElements\nMoobot\nStreamlabs\nFossabot";

export const manifest = {
  id: CHAT_OVERLAY_PLUGIN_ID,
  name: "聊天疊層",
  version: "0.1.0",
  api: "0.1",
  description:
    "在 OBS 顯示已正規化的聊天。過濾、遮罩、停留時間與贊助混入都在這份設定。它不連到 Twitch 或 YouTube，所以下一個平台來源不必改這個外掛。",
  kind: ["overlay"],
  permissions: ["events.subscribe", "overlay.slot", "dashboard.settings"],
  entry: {
    overlay: "./src/index.ts",
  },
  settingsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      lifetimeSeconds: {
        type: "integer",
        title: "訊息停留秒數",
        description: "0 表示一直留著，直到超過最多行數。",
        minimum: 0,
        default: 0,
      },
      maxLines: {
        type: "integer",
        title: "最多行數",
        description: "超過後拿掉最舊的一行。",
        minimum: 1,
        default: 12,
      },
      hideBots: {
        type: "boolean",
        title: "隱藏機器人",
        description: "比對顯示名稱與登入名稱，不分大小寫。",
        default: true,
      },
      botNames: {
        type: "string",
        title: "機器人名稱",
        description: "一行一個，也可以用逗號分隔。",
        "x-s4n-multiline": true,
        default: DEFAULT_BOT_NAMES,
      },
      hideCommands: {
        type: "boolean",
        title: "隱藏指令",
        description: "隱藏以 ! 開頭的訊息。",
        default: true,
      },
      keywords: {
        type: "string",
        title: "關鍵字遮罩",
        description: "一行一個。出現時整段換成同樣長度的 ＊。",
        "x-s4n-multiline": true,
        default: "",
      },
      syncModeration: {
        type: "boolean",
        title: "同步刪除與封鎖",
        description: "平台刪除單則訊息，或封鎖、超時、清空聊天室時，疊層跟著拿掉。",
        default: true,
      },
      mixDonations: {
        type: "boolean",
        title: "把贊助混進聊天",
        description: "預設關閉。開啟後，入帳贊助與測試贊助會變成一行聊天。測試贊助仍然不寫入帳本。",
        default: false,
      },
    },
  },
} as const satisfies PluginManifest;
