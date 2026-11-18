---
title: 範例外掛
description: 一份社群疊層清單，以及官方綠界清單的密文欄位。
---

可編譯、可測試的社群範例是 `plugins/example-thanks`（`@s4n/plugin-example-thanks`）。它只有疊層與儀表板設定，沒有密鑰，也沒有付款，而且沒有放進官方目錄。做法見 [外掛開發](/guides/plugin-dev/)。清單如下。

```json
{
  "id": "community.thanks",
  "name": "感謝小卡",
  "version": "0.1.0",
  "api": "0.1",
  "description": "示範用的社群疊層。訂閱贊助事件，並用事件 id 排除重複。沒有進官方目錄。",
  "kind": ["overlay", "dashboard"],
  "permissions": ["events.subscribe", "overlay.slot", "dashboard.settings"],
  "entry": {
    "overlay": "./src/overlay.ts",
    "dashboard": "./src/overlay.ts"
  },
  "settingsSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "durationMs": {
        "type": "integer",
        "title": "顯示時間（毫秒）",
        "minimum": 1000,
        "default": 8000
      }
    }
  }
}
```

若它請求 `secrets`、`network` 或 `payments.provider`，核心的允許清單會拒絕。把 id 改成 `official.something` 也不會自動變成官方外掛。

## 官方付款外掛

綠界與歐付寶的每種付款方式各是一份清單：信用卡、ATM、超商代碼、超商條碼。工人組出結帳表單，並驗證付款通知、取號通知與查單結果的 CheckMacValue。表單會送到廠商，查單也會打廠商的 API，但工人碰不到帳本。核心先建立待付款訂單；簽章、商店代號、付款方式與金額都通過之後，才由核心寫帳。取號成功只把訂單改成待繳費。密文欄位是商店代號、HashKey、HashIV。`environment` 是 `stage` 或 `production`，不是密文。

```json
{
  "id": "official.ecpay",
  "name": "綠界信用卡",
  "version": "0.2.0",
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

歐付寶信用卡的欄位相同，id 是 `official.opay`。ATM、超商代碼、超商條碼的 id 是 `official.ecpay-atm`、`official.ecpay-cvs`、`official.ecpay-barcode`，以及對應的 `official.opay-*`，版本 `0.1.0`，密文欄位相同。贊助提醒會在疊層顯示名稱、金額與留言，版本 `0.1.0`，沒有密文欄位。目標、跑馬燈與語音仍是官方佔位，版本是 `0.0.0`，沒有密文欄位。
