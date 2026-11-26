---
title: 外掛規格 0.1
description: s4n-plugin.json、權限、密文欄位，以及外掛可以收發的事件。
---

每個外掛有一份 `s4n-plugin.json`。`api` 目前只接受 `0.1`。怎麼寫、怎麼測，見 [外掛開發](/guides/plugin-dev/) 與 [外掛 SDK](/reference/plugin-sdk/)。可編譯的範例是 `plugins/example-thanks`。

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

字串欄位可以加 `x-s4n-multiline: true`，儀表板會用多行輸入。欄位可以有 `default`，但密文欄位不行，否則預設值會被送回瀏覽器。`default` 只在尚未儲存時使用。

## 聊天來源與聊天疊層

v1 把聊天拆成兩種外掛：

| 角色 | 這個版本的 id | `kind` | 做什麼 |
| --- | --- | --- | --- |
| 來源 | `official.twitch-chat` | `connector` | 連到平台，送出正規化事件 |
| 顯示 | `official.chat-overlay` | `overlay` | 訂閱那些事件並畫在 OBS |

來源實作 `s4n-donate-system-2.0-plugin-sdk` 的 `ChatSource`：`start`、`stop`、`applySettings`，並透過 `ChatSourceHost` 發送 `s4n.chat.message`、`s4n.chat.delete`、`s4n.chat.clear`。顯示外掛不匯入任何來源。下一個版本的 YouTube 來源只要實作同一個 `ChatSource` 並註冊進官方目錄，聊天疊層不用改。

Twitch 來源需要 `events.emit`、`secrets` 與 `network`。頻道名稱是一般設定。Client ID 與 Client Secret 是密文，選填。顯示外掛只要 `events.subscribe`、`overlay.slot`、`dashboard.settings`，自己不連外網。

## 權限

| 權限 | 誰能用 | 做什麼 |
| --- | --- | --- |
| `events.subscribe` | 所有外掛 | 透過 SDK 訂閱事件 |
| `events.emit` | 所有外掛 | 透過 SDK 發送事件，但不能偽造核心付款事件 |
| `overlay.slot` | 所有外掛 | 宣告疊層版位。要排進共用畫布，清單還要有 `overlaySlot` 矩形 |
| `dashboard.settings` | 所有外掛 | 儀表板上的設定 |
| `tts.speak` | 所有外掛 | 舊的權限名稱。沒有語音外掛 |
| `payments.read` | 所有外掛 | 唯讀付款資料。這個版本沒有讀取 API |
| `payments.provider` | 僅官方 | 註冊付款提供者、建立付款、驗證回呼。不能寫帳 |
| `secrets` | 僅官方 | 設定裡可以有密文欄位 |
| `network` | 僅官方 | 對外連線。綠界與歐付寶用它向廠商查單 |

社群外掛的預設是疊層與儀表板設定：`events.subscribe`、`overlay.slot`、`dashboard.settings`。

## 事件

外掛只能透過 `s4n-donate-system-2.0-plugin-sdk` 的 `createPluginBus` 訂閱與發送。

這些事件會寫進 PostgreSQL 的事件紀錄。每一則有單調的 `sequence` 與自己的 `id`。送達是至少一次：斷線的客戶端帶著最後的序號重連，伺服器依序補上，客戶端用 `id` 排除重複。外掛的 `emit` 不能假設對方只會收到一次。保留期限、重播上限與升級見 [事件紀錄](/guides/events/)。

核心保留事件，外掛不能發送：

- `s4n.donation.created`
- `s4n.donation.succeeded`
- `s4n.donation.failed`
- `s4n.donation.test`（工作台的測試贊助，不寫入帳本）

其餘事件：

- `s4n.chat.message`
- `s4n.chat.delete`
- `s4n.chat.clear`
- `s4n.goal.updated`
- `s4n.tts.request`（舊事件。沒有外掛會朗讀，疊層也不接收）
- `s4n.media.now_playing`

`s4n.chat.message` 是與平台無關的一則訊息：`platform`（`twitch`、`youtube`，或核心混入的 `s4n`）、`channel`、`userId`、`login`、`displayName`、`color`、`badges`、`fragments`（`text` 或 `emote`）、`text`、`timestamp`、`messageId`，以及 `flags`（`isMod`、`isBroadcaster`、`isSubscriber`、`isVip`）。混入的贊助才帶 `donation`。`s4n.chat.delete` 拿掉一則（Twitch 的 CLEARMSG）。`s4n.chat.clear` 是封鎖、超時或清空頻道（CLEARCHAT）；有 `userId` 時只拿掉那個人，有 `durationSeconds` 時是超時。

贊助人名稱、留言、聊天內容與點播者名稱都是不受信任文字。跑馬燈與目標名稱也只當純文字。金額以最小貨幣單位的整數表示。這個骨架把 TWD 的 1 單位訂為新台幣 1 元，因為綠界與歐付寶的金額是整數元。

## 密文欄位

在 `settingsSchema.properties` 的欄位上設 `x-s4n-secret: true`。核心加密後存進 `EncryptedPluginSetting`。儀表板的外掛頁只看得到欄位名稱與是否已設定。沒有這個旗標的欄位是一般設定，出現在 `/plugins/:id/settings`。`s4n-donate-system-2.0-plugin-sdk` 的 `secretFieldKeys` 與 `publicFieldKeys` 依這個旗標分開，沒有第二個旗標。

範例見 [範例外掛](/reference/example/)，完整檔案在 `plugins/ecpay/s4n-plugin.json` 與 `plugins/opay/s4n-plugin.json`。
