---
title: 外掛 SDK
description: "@s4n/plugin-sdk 的清單、權限、事件、疊層、聊天來源與付款契約。規格版本 0.1。"
---

套件是 `@s4n/plugin-sdk`。事件型別在 `@s4n/events`。下面的片段都對得上 `plugins/example-thanks`，那個套件的測試會編譯並執行它們。

```ts
import {
  PLUGIN_API_VERSION,
  assertPermissionsAllowed,
  createPluginBus,
  parseManifest,
  type ChatSource,
  type PaymentProvider,
  type PluginBus,
  type PluginManifest,
} from "@s4n/plugin-sdk";
import { acceptEventId, nextCursor, type S4nEvent } from "@s4n/events";
```

`PLUGIN_API_VERSION` 目前是 `"0.1"`。檢查碼輔助函式在 `@s4n/plugin-sdk/aio`，給綠界與歐付寶用，社群外掛不需要。

## 清單欄位

`parseManifest` 讀 `s4n-plugin.json`。

| 欄位 | 規則 |
| --- | --- |
| `id` | 小寫，至少一段 `.` 或 `-`。例如 `community.thanks` |
| `name` | 顯示名稱 |
| `version` | 外掛自己的版本 |
| `api` | 必須是 `"0.1"` |
| `description` | 選填 |
| `kind` | `overlay`、`dashboard`、`connector`、`payment`、`processor`，至少一個 |
| `permissions` | 見下方。未知的字串會被拒絕 |
| `entry` | `overlay`、`dashboard`、`worker` 至少一個路徑 |
| `settingsSchema` | `type: "object"` 的 JSON Schema |

`kind` 含 `payment` 時必須請求 `payments.provider`，並且有 `entry.worker`。有 `x-s4n-secret` 欄位就必須請求 `secrets`。欄位名稱只能是英數，而且以字母開頭。

## 權限

| 權限 | 誰能用 | 做什麼 |
| --- | --- | --- |
| `events.subscribe` | 所有外掛 | 透過 `PluginBus.subscribe` 收事件 |
| `events.emit` | 所有外掛 | 透過 `PluginBus.emit` 發事件，但不能發核心保留的贊助事件 |
| `overlay.slot` | 所有外掛 | 宣告自己要一塊疊層。見下方限制 |
| `dashboard.settings` | 所有外掛 | 儀表板設定表單 |
| `tts.speak` | 所有外掛 | 請求語音。這個版本沒有合成器 |
| `payments.read` | 所有外掛 | 預留的唯讀付款。這個版本沒有讀取 API |
| `payments.provider` | 僅官方 | 建立結帳表單、驗證回呼。不能寫帳 |
| `secrets` | 僅官方 | 設定裡可以有密文欄位 |
| `network` | 僅官方 | 對外連線 |

`assertPermissionsAllowed(id, permissions, officialIds)` 會拒絕不在允許清單上的外掛請求後三項。官方 id 列在 `OFFICIAL_PLUGIN_IDS`。

## 設定與密文

欄位型別是 `string`、`number`、`integer`、`boolean`。可以有 `title`、`description`、`enum`、`minimum`。

`x-s4n-multiline: true` 只給字串，儀表板用多行輸入。`default` 只在尚未儲存時使用。密文欄位不能有 `default`，否則預設值會回到瀏覽器。

密文欄位加 `x-s4n-secret: true`。沒有這個旗標的欄位就是一般設定。不需要另一個旗標。`secretFieldKeys` 列出密文，`publicFieldKeys` 列出一般設定，`isSecretField` 判斷單一欄位。`hasPluginSettingsNav` 在外掛有一般設定，或 `kind` 含 `overlay` 時為真；儀表板用它決定啟用後要不要出現在側欄「外掛」。

核心用 `S4N_MASTER_KEY`（32 位元組）做 AES-256-GCM，附加驗證資料是 `s4n.plugin-setting:<pluginId>:<fieldKey>`。同一段密文不能挪到別的欄位。加密方式與這次的頁面搬移無關。

外掛頁只編輯密文。徽章只有兩種字：**已設定**、**未設定**。儲存之後的回應沒有明文，也沒有密文。輸入框留空表示保留已經存好的值。一般設定在 `/plugins/:id/settings`，由側欄「外掛」進入。`GET` 與 `PUT /api/plugins/:id/settings` 同時回 `fields`、`secretFields` 與 `publicFields`。只送其中一邊時，必填檢查也只看那一邊，所以可以先存密文、再存環境。

## 訂閱與發送

外掛拿到的是 `PluginBus`，不是核心的匯流排物件。

```ts
export function watchDonations(bus: PluginBus, onAlert: (event: ThanksEvent) => void): () => void {
  const stopPaid = bus.subscribe("s4n.donation.succeeded", onAlert);
  const stopTest = bus.subscribe("s4n.donation.test", onAlert);
  return () => {
    stopPaid();
    stopTest();
  };
}
```

`emit` 可以發 `s4n.chat.message`、`s4n.chat.delete`、`s4n.chat.clear`、`s4n.goal.updated`、`s4n.tts.request`、`s4n.media.now_playing`。下面四個會丟錯：

- `s4n.donation.created`
- `s4n.donation.succeeded`
- `s4n.donation.failed`
- `s4n.donation.test`

金額是整數。TWD 的 1 單位是新台幣 1 元，因為綠界與歐付寶收整數元。

## 事件紀錄

每一則寫進 PostgreSQL 之後都有：

- `id`：事件自己的 id。送達是至少一次，重連或重試可能再送同一則。
- `sequence`：十進位字串，單調遞增。客戶端把它存起來，下次連線用查詢參數 `since` 補看錯過的事件。
- `occurredAt`：寫入時間。

第一次連線、瀏覽器還沒有序號時，不會把歷史全部播完。已有序號的客戶端會依序補上，預設最多 200 則。更早的仍留在紀錄裡，直到保留期限（預設 7 天，聊天 24 小時）。

範例用 SDK 同一套去重：

```ts
export function shouldShow(seen: readonly string[], id: string, cursor: string | null, sequence: string) {
  const decision = acceptEventId(seen, id);
  return {
    show: decision.fresh,
    seen: decision.seen,
    cursor: nextCursor(cursor, sequence),
  };
}
```

`show` 為 false 時不要再畫一次。序號只往前移。細節與升級見 [事件紀錄](/guides/events/)。

## 疊層版位

要出現在共用畫布上，清單要有 `overlaySlot`，並具備 `kind` 含 `overlay`、權限 `overlay.slot`。`overlaySlot` 是預設矩形，`x`、`y`、`width`、`height` 都是畫布的比例（0 到 1），寬與高至少 0.05，而且不能超出畫布。

```json
"overlaySlot": { "x": 0.04, "y": 0.62, "width": 0.36, "height": 0.32 }
```

OBS 只有一條網址。權杖仍是核心核發的疊層權杖，網址上沒有外掛密文，也不再靠 `plugin` 選畫面。營運者在疊層頁拖曳後儲存的位置會蓋過這個預設值。位置以比例儲存，畫布改尺寸時區塊跟著縮放。

`kind` 含 `overlay` 但沒有 `overlaySlot` 的外掛不會被排上去。目標與跑馬燈目前就是這樣。

這個版本的轉送寫在 `apps/api/src/realtime/audience.ts` 的 `overlayPluginFor`，只認：

| 事件 | 疊層 |
| --- | --- |
| `s4n.donation.*` | `official.alerts` |
| `s4n.chat.message` / `delete` / `clear` | `official.chat-overlay` |
| `s4n.goal.updated` | `official.goals` |
| `s4n.tts.request` | `official.tts` |

`s4n.media.now_playing` 還沒有疊層。社群清單可以宣告 `overlay.slot`，但不會因此得到一條 `/ws/overlay`。`plugins/example-thanks` 示範訂閱與去重，沒有註冊進目錄。

## 聊天來源

`ChatSource` 是平台連接器。`official.twitch-chat` 的 `createTwitchChatSource` 是目前的實作。

```ts
export interface ChatSource {
  readonly pluginId: string;
  readonly platform: ChatPlatform;
  start(host: ChatSourceHost): void;
  stop(): void;
  applySettings(settings: ChatSourceSettings): void;
}
```

`ChatSourceHost` 只有三個方法：`emitMessage`、`emitDelete`、`emitClear`。它們送出 `@s4n/events` 的正規化事件。顯示外掛訂閱那些事件，不匯入來源。

`applySettings` 收到一般設定，以及只活在這個程序裡的解密密文。Twitch 的頻道名稱是一般設定。Client ID 與 Client Secret 是密文，選填。沒有填時用匿名 `justinfan`。密文與換到的應用程式權杖不得進 OBS 網址或事件。徽章圖的快取留在程序記憶體，重啟後先顯示文字。

YouTube 若要加進來，實作同一個 `ChatSource`、送同一份事件，並註冊進官方目錄。聊天疊層不用改。

## 付款契約

核心建立訂單並寫入帳本的「待付款」。外掛的 `PaymentProvider` 做這些事，碰不到帳本：

1. `createPayment` 用核心給的 `orderId`、金額與回呼網址組出結帳表單。表單的 `action` 是廠商網址，`fields` 是字串欄位。金額不得改成別的數字。信用卡帶 ReturnURL、OrderResultURL、ClientBackURL。ATM、超商代碼、超商條碼帶 ReturnURL、PaymentInfoURL、ClientRedirectURL，不帶 OrderResultURL。
2. `verifyCallback` 驗證 ReturnURL。用常數時間比較 CheckMacValue，並核對商店代號與付款方式。通過時回傳訂單編號、廠商參考號、簽章裡的金額，以及 `paid`、`failed` 或 `simulated`。簽章不符就拒絕。取號成功碼（ATM 的 `2`、超商的 `10100073`）出現在這條網址時當成格式錯誤，不把訂單標成失敗。
3. `verifyPaymentInfo` 只給非信用卡。驗證 PaymentInfoURL，回傳銀行代碼、虛擬帳號或超商代碼、三段條碼，以及期限。這不是付款。
4. `queryTrade` 用伺服器上的金鑰向廠商查單（QueryTradeInfo）。核心仍以帳本金額為準。通知沒到時，到期作業會先查單再決定入帳或過期。訂單已經過期才收到付款成功時，核心改成待人工處理，不入帳，也不送提醒。
5. `provisionalExpiry` 告訴核心一筆還沒付款的訂單可以開多久。取號通知裡的期限會蓋過這個暫定值。

綠界與歐付寶的 `notifyBody` 是 `1|OK` 與 `0|Error`。同一筆成功通知再來一次，核心回 `1|OK`，而且不會再插一列入帳事件。簽章通過但交易失敗，訂單改成失敗，只發一次 `s4n.donation.failed`。取號成功不發 `s4n.donation.succeeded`。

外掛拿不到帳本，也看不到別的外掛的密文。正式站不會把模擬付款入帳。回呼網址來自 `S4N_PUBLIC_BASE_URL`，不用這次請求的 Host。`s4n.donation.test` 不建立訂單。
