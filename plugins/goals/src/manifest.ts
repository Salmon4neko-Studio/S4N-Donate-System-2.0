import type { PluginManifest } from "@s4n/plugin-sdk";

export const manifest = {
  id: "official.goals",
  name: "目標進度",
  version: "0.1.0",
  api: "0.1",
  description: "在疊層顯示目標名稱、目前與目標金額，以及百分比進度條。進度由帳本的已付款贊助計算。",
  kind: ["overlay", "dashboard"],
  permissions: ["events.subscribe", "overlay.slot", "dashboard.settings"],
  entry: {
    overlay: "./src/index.ts",
    dashboard: "./src/index.ts",
  },
  overlaySlot: { x: 0.04, y: 0.04, width: 0.56, height: 0.16 },
  settingsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        title: "目標名稱",
        description: "畫在進度條上方。輸出是純文字。",
        default: "本月目標",
        maxLength: 40,
      },
      targetMinor: {
        type: "integer",
        title: "目標金額（元）",
        description: "新台幣整數。1 元就是 1。",
        minimum: 1,
        maximum: 10000000,
        default: 1000,
      },
      since: {
        type: "string",
        title: "起算時間",
        description: "只計算這個時間之後入帳的贊助。留空表示從帳本最早的已付款開始。重設為現在會把之前的金額清出這次目標。",
        "x-s4n-datetime": true,
        default: "",
        maxLength: 40,
      },
      creditedOnly: {
        type: "boolean",
        title: "只計已入帳",
        description: "開啟時只加總已付款。關閉時，待人工處理（過期後才收到、沒有入帳）也會計入。測試贊助永遠不算。",
        default: true,
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
        title: "進度條主色",
        description: "已完成的部分。使用 #RGB 或 #RRGGBB。",
        "x-s4n-color": true,
        default: "#f28500",
      },
      secondaryColor: {
        type: "string",
        title: "進度條副色",
        description: "尚未完成的軌道。使用 #RGB 或 #RRGGBB。",
        "x-s4n-color": true,
        default: "#f4efe8",
      },
    },
  },
} as const satisfies PluginManifest;
