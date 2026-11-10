---
title: 範例外掛
description: 一份社群疊層清單，以及官方綠界清單的密文欄位。
---

社群外掛不在這次載入的官方清單裡。下面這份清單是規格範例：只有疊層與儀表板設定，沒有密鑰，也沒有付款。

```json
{
  "id": "community.thanks-card",
  "name": "感謝小卡",
  "version": "0.1.0",
  "api": "0.1",
  "description": "收到贊助事件後顯示一張小卡。名稱與留言必須先消毒。",
  "kind": ["overlay", "dashboard"],
  "permissions": ["events.subscribe", "overlay.slot", "dashboard.settings"],
  "entry": {
    "overlay": "./src/overlay.ts",
    "dashboard": "./src/settings.ts"
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
}
```

若它請求 `secrets`、`network` 或 `payments.provider`，核心的允許清單會拒絕。把 id 改成 `official.something` 也不會自動變成官方外掛。

## 官方付款外掛

綠界與歐付寶是兩份獨立清單。工人會拋出尚未實作，不會呼叫金流 API，也碰不到帳本。密文欄位是商店代號、HashKey、HashIV。`environment` 是 `stage` 或 `production`，不是密文。

```json
{
  "id": "official.ecpay",
  "name": "綠界 ECPay",
  "version": "0.1.0",
  "api": "0.1",
  "kind": ["payment"],
  "permissions": ["payments.provider", "secrets", "network"],
  "entry": { "worker": "./src/index.ts" },
  "settingsSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["merchantId", "hashKey", "hashIv", "environment"],
    "properties": {
      "merchantId": { "type": "string", "title": "商店代號 MerchantID", "x-s4n-secret": true },
      "hashKey": { "type": "string", "title": "HashKey", "x-s4n-secret": true },
      "hashIv": { "type": "string", "title": "HashIV", "x-s4n-secret": true },
      "environment": { "type": "string", "title": "環境", "enum": ["stage", "production"] }
    }
  }
}
```

歐付寶的欄位相同，id 是 `official.opay`。提醒、目標、跑馬燈與語音是官方佔位，版本 `0.0.0`，沒有密文欄位。
