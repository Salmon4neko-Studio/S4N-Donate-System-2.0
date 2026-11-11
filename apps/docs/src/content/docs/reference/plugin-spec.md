---
title: 外掛規格 0.1
description: s4n-plugin.json、權限、密文欄位，以及外掛可以收發的事件。
---

每個外掛有一份 `s4n-plugin.json`。`api` 目前只接受 `0.1`。

| 欄位 | 說明 |
| --- | --- |
| `id` | 小寫，至少含一個 `.` 或 `-`。官方外掛使用 `official.*` |
| `name` | 顯示名稱 |
| `version` | 外掛自己的版本 |
| `api` | `"0.1"` |
| `kind` | `overlay`、`dashboard`、`connector`、`payment`、`processor`，可多個 |
| `permissions` | 見下方 |
| `entry` | `overlay`、`dashboard`、`worker` 至少一個路徑 |
| `settingsSchema` | JSON Schema 物件。密文欄位加 `x-s4n-secret: true` |

`kind` 含 `payment` 時，必須請求 `payments.provider`，並且提供 `entry.worker`。有密文欄位就必須請求 `secrets`。

## 權限

| 權限 | 誰能用 | 做什麼 |
| --- | --- | --- |
| `events.subscribe` | 所有外掛 | 透過 SDK 訂閱事件 |
| `events.emit` | 所有外掛 | 透過 SDK 發送事件，但不能偽造核心付款事件 |
| `overlay.slot` | 所有外掛 | 宣告疊層版位 |
| `dashboard.settings` | 所有外掛 | 儀表板上的設定 |
| `tts.speak` | 所有外掛 | 請求語音。這次沒有合成器 |
| `payments.read` | 所有外掛 | 唯讀付款資料。這次沒有讀取 API |
| `payments.provider` | 僅官方 | 註冊付款提供者、建立付款、驗證回呼。不能寫帳 |
| `secrets` | 僅官方 | 設定裡可以有密文欄位 |
| `network` | 僅官方 | 對外連線。綠界與歐付寶用它向廠商查單 |

社群外掛的預設是疊層與儀表板設定：`events.subscribe`、`overlay.slot`、`dashboard.settings`。

## 事件

外掛只能透過 `@s4n/plugin-sdk` 的 `createPluginBus` 訂閱與發送。

核心保留事件，外掛不能發送：

- `s4n.donation.created`
- `s4n.donation.succeeded`
- `s4n.donation.failed`
- `s4n.donation.test`（工作台的測試贊助，不寫入帳本）

其餘事件：

- `s4n.chat.message`
- `s4n.goal.updated`
- `s4n.tts.request`
- `s4n.media.now_playing`

贊助人名稱、留言、聊天內容、語音文字與點播者名稱都是不受信任文字。金額以最小貨幣單位的整數表示。這個骨架把 TWD 的 1 單位訂為新台幣 1 元，因為綠界與歐付寶的金額是整數元。

## 密文欄位

在 `settingsSchema.properties` 的欄位上設 `x-s4n-secret: true`。核心加密後存進 `EncryptedPluginSetting`。儀表板只看得到欄位名稱與是否已設定。

範例見 [範例外掛](/reference/example/)，完整檔案在 `plugins/ecpay/s4n-plugin.json` 與 `plugins/opay/s4n-plugin.json`。
