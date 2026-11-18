---
title: 外掛開發
description: 來源、顯示與付款外掛的差別、本機怎麼測、以及規格 0.1 的安全規則。
---

外掛是一份 `s4n-plugin.json` 加上工人或畫面。核心握有帳本、付款訂單、事件紀錄、疊層權杖與密文。外掛只能透過 `@s4n/plugin-sdk` 跟核心說話。

可編譯的社群範例在 `plugins/example-thanks`。它沒有放進官方目錄，儀表板不會列出它。API 參考見 [外掛 SDK](/reference/plugin-sdk/)。

## 三種角色

| 角色 | `kind` | 做什麼 | 這個版本的例子 |
| --- | --- | --- | --- |
| 來源 | `connector` | 連到平台，送出已經正規化的事件 | `official.twitch-chat` |
| 顯示 | `overlay` | 訂閱事件，畫在 OBS | `official.alerts`、`official.chat-overlay` |
| 付款 | `payment` | 組結帳表單、驗證 CheckMacValue | `official.ecpay`、`official.opay` |

顯示外掛不匯入來源。Twitch 聊天與之後的 YouTube 都送同一份 `s4n.chat.message`，聊天疊層不用改。

`kind` 還可以是 `dashboard` 或 `processor`。`processor` 這個版本沒有執行期。一份清單可以同時是 `overlay` 與 `dashboard`，範例外掛就是這樣。

## 付款只給官方允許清單

`payments.provider`、`secrets`、`network` 只給 `apps/api/src/plugins/official.ts` 裡點名的 id。名字以 `official.` 開頭不夠。付款實作目前只允許 `official.ecpay` 與 `official.opay`。

社群外掛的預設權限是 `events.subscribe`、`overlay.slot`、`dashboard.settings`。可以再加 `events.emit`，仍然不能發送核心保留的贊助事件。

## 規格版本

清單的 `api` 必須是 `"0.1"`，對應 `@s4n/plugin-sdk` 的 `PLUGIN_API_VERSION`。解析器遇到別的值會拒絕。

`0.1` 裡面的相容追加（新的可選欄位、新的事件名稱）會寫在 [外掛規格 0.1](/reference/plugin-spec/) 與 [外掛 SDK](/reference/plugin-sdk/)。不相容的變更會把 `PLUGIN_API_VERSION` 改成下一個版本，舊清單不會被載入。現在沒有 `0.2`。

外掛自己的 `version` 是外掛的版本，跟規格版本無關。

## 在本機測試

範例的測試會解析清單、確認它不能請求官方權限，並用真實的 `createPluginBus` 訂閱一則測試贊助。它也確認外掛送不出 `s4n.donation.test`。

```bash
pnpm --filter @s4n/plugin-example-thanks test
pnpm --filter @s4n/plugin-example-thanks typecheck
```

`pnpm test` 與 `pnpm typecheck` 會一併跑到這個套件。測試不需要資料庫。

要讓儀表板真的載入一份外掛，還得把它加進 `createOfficialCatalog` 與 `OFFICIAL_PLUGIN_IDS`。社群 id 即使請求 `overlay.slot`，這個版本也不會自動出現在 OBS。原因見 [外掛 SDK](/reference/plugin-sdk/) 的疊層一節。

## 安全規則

- 外掛碰不到帳本。入帳只發生在核心，而且金額來自核心建立的訂單。
- `events.emit` 不能發送 `s4n.donation.created`、`succeeded`、`failed` 或 `s4n.donation.test`。測試贊助由工作台發出。
- 密文用 `S4N_MASTER_KEY` 做 AES-256-GCM。儀表板徽章只顯示「已設定」或「未設定」。留空表示不改已存的值。API 不回明文，也不回密文。
- 事件的 JSON 不得含金鑰形狀的欄位。核心在寫入事件紀錄前會拒絕。
- 贊助人名稱、留言、聊天文字是 `UntrustedText`。畫面要用文字節點，不要當成 HTML。
- 事件至少送達一次。斷線補送可能再送同一則，用事件 `id` 排除重複。序號與保留期限見 [事件紀錄](/guides/events/)。
- 不要把疊層權杖、Twitch Client Secret、HashKey 或 HashIV 放進網址、紀錄或事件。
