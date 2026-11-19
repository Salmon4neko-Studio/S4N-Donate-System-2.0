import type { PluginManifest } from "@s4n/plugin-sdk";

export const manifest = {
  id: "official.ticker",
  name: "跑馬燈",
  version: "0.1.0",
  api: "0.1",
  description: "在疊層捲動純文字。可以放自訂句子，也可以接上最近的贊助。",
  kind: ["overlay"],
  permissions: ["events.subscribe", "overlay.slot"],
  entry: {
    overlay: "./src/index.ts",
  },
  overlaySlot: { x: 0.04, y: 0.22, width: 0.56, height: 0.12 },
  settingsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "string",
        title: "自訂文字",
        description: "一行一則。隱藏字元會拿掉，輸出是純文字。",
        "x-s4n-multiline": true,
        default: "歡迎來贊助",
        maxLength: 2000,
      },
      includeDonations: {
        type: "boolean",
        title: "加入最近贊助",
        description: "接在自訂文字後面。只取已付款，測試贊助不算。",
        default: true,
      },
      donationCount: {
        type: "integer",
        title: "最近幾筆",
        description: "1 到 20。",
        minimum: 1,
        maximum: 20,
        default: 5,
      },
      includeMessage: {
        type: "boolean",
        title: "贊助包含留言",
        description: "關閉時只顯示名稱與金額。",
        default: false,
      },
      speed: {
        type: "integer",
        title: "捲動速度",
        description: "每秒大約幾個字。數字愈大愈快。",
        minimum: 1,
        maximum: 40,
        default: 8,
      },
      direction: {
        type: "string",
        title: "方向",
        enum: ["left", "right"],
        default: "left",
      },
      textColor: {
        type: "string",
        title: "文字顏色",
        description: "使用 #RGB 或 #RRGGBB。",
        "x-s4n-color": true,
        default: "#1a1512",
      },
      primaryColor: {
        type: "string",
        title: "背景主色",
        description: "使用 #RGB 或 #RRGGBB。",
        "x-s4n-color": true,
        default: "#f28500",
      },
      secondaryColor: {
        type: "string",
        title: "背景副色",
        description: "跟主色排成漸層。使用 #RGB 或 #RRGGBB。",
        "x-s4n-color": true,
        default: "#ffd7a8",
      },
    },
  },
} as const satisfies PluginManifest;
