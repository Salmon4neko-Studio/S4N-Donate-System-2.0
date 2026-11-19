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
| 顯示 | `overlay` | 訂閱事件，畫在 OBS | `official.alerts`、`official.chat-overlay`、`official.goals`、`official.ticker` |
| 付款 | `payment` | 組結帳表單、驗證 CheckMacValue、取號通知 | `official.ecpay`、`official.ecpay-atm`、`official.ecpay-cvs`、`official.ecpay-barcode`、`official.opay`、`official.opay-atm`、`official.opay-cvs`。`official.opay-barcode` 先不註冊 |

顯示外掛不匯入來源。Twitch 聊天與之後的 YouTube 都送同一份 `s4n.chat.message`，聊天疊層不用改。

`kind` 還可以是 `dashboard` 或 `processor`。`processor` 這個版本沒有執行期。一份清單可以同時是 `overlay` 與 `dashboard`，範例外掛就是這樣。

## 付款只給官方允許清單

`payments.provider`、`secrets`、`network` 只給 `apps/api/src/plugins/official.ts` 裡點名的 id。名字以 `official.` 開頭不夠。付款實作只允許 `PAYMENT_PLUGIN_IDS`：綠界與歐付寶的信用卡、ATM、超商代碼，以及綠界超商條碼。歐付寶超商條碼先不在這份清單。一種方式一份外掛。

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
- 密文用 `S4N_MASTER_KEY` 做 AES-256-GCM。外掛頁的徽章只顯示「已設定」或「未設定」。留空表示不改已存的值。API 不回明文，也不回密文。一般設定在各外掛的 `/plugins/:id/settings`。
- 事件的 JSON 不得含金鑰形狀的欄位。核心在寫入事件紀錄前會拒絕。
- 贊助人名稱、留言、聊天文字是 `UntrustedText`。畫面要用文字節點，不要當成 HTML。
- 事件至少送達一次。斷線補送可能再送同一則，用事件 `id` 排除重複。序號與保留期限見 [事件紀錄](/guides/events/)。
- 不要把疊層權杖、Twitch Client Secret、HashKey 或 HashIV 放進網址、紀錄或事件。

## 包裝、簽名、發佈到官方索引

官方市集不執行任意下載的程式。一份官方外掛要出現在市集，必須同時滿足：

1. `s4n-plugin.json` 與程式放在這個版本裡，id 在 `OFFICIAL_PLUGIN_IDS`。
2. 金流還要在 `PAYMENT_PLUGIN_IDS`。目前是綠界與歐付寶的信用卡、ATM、超商代碼，以及綠界超商條碼。歐付寶超商條碼先不放進允許清單。
3. 索引 `apps/api/registry/official.json` 的簽章通過釘選的公鑰，而且該外掛的 `sha256` 等於清單的正規化 JSON。

`apps/api/registry/listings.json` 只放分類、作者、是否精選、圖示、更新紀錄與示意畫面。名稱、版本、權限與摘要由簽名腳本從 `s4n-plugin.json` 讀入，避免兩份清單各寫各的。

摘要是 SHA-256，輸入是把清單解析成 JSON 之後、鍵名排序、沒有空白的 UTF-8。檔案裡的鍵順序與換行不影響摘要。

索引格式是 `s4n-registry-index` 第 1 版。簽章是 Ed25519，簽的是索引物件的同一種正規化 JSON，不是整個檔案的原文。信封長這樣：

```json
{ "index": { "format": "s4n-registry-index", "version": 1, "plugins": [] }, "signature": "<base64>" }
```

私鑰不進版本庫。在存放私鑰的機器上：

```bash
export S4N_REGISTRY_SIGNING_KEY="$(cat /path/to/signing-key.pem)"
pnpm --filter @s4n/api exec tsx scripts/sign-registry.ts
```

`S4N_REGISTRY_SIGNING_KEY` 是 PKCS#8 PEM。公鑰寫在 `apps/api/src/plugins/marketplace/pinned-key.ts`。換一把鑰匙時，公鑰與新的 `official.json` 要在同一個審查過的提交裡一起換。只換索引、不換公鑰，而私鑰又不在手上，簽章不會通過。

官方清單已用擁有者的正式 Ed25519 金鑰簽署，並釘選公鑰。私鑰不在版本庫。

社群目錄留了 `RegistrySource`。v1 的社群來源是空的。之後若接上，讀到的位元組仍要用同一把公鑰驗證。金流一律拒絕。權限超出 `events.subscribe`、`overlay.slot`、`dashboard.settings` 的社群外掛也不能安裝。就算權限都在這組裡，這個版本也只記下安裝，不載入它的程式。

示意畫面只用內建的分類圖，不接受外掛帶上的網址。

