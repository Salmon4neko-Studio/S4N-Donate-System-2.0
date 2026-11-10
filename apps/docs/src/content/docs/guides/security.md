---
title: 安全性
description: 主金鑰、密文設定、回呼記帳，以及這次還沒做的認證。
---

## 主金鑰與密文

伺服器環境只放一把 `S4N_MASTER_KEY`。它必須是標準 Base64，解出來剛好 32 位元組。外掛的 MerchantID、HashKey、HashIV 在寫入時以 AES-256-GCM 密封，附加驗證資料是 `s4n.plugin-setting:<pluginId>:<fieldKey>`，所以同一段密文不能挪到別的欄位。

儀表板與 `GET /api/plugins/:id/settings` 只回「這個欄位是密文、是否已設定」。回應不會帶明文，也不會帶密文本身。解密只發生在核心記憶體裡，用來簽名或驗證，用完不進回應。

全零的開發金鑰在 `S4N_ENV=production` 會拒絕啟動。

## 付款回呼

路由是 `POST /api/payments/:pluginId/callback`。

1. 核心找出已註冊的付款外掛。社群外掛或不在清單裡的 id 不會進到記帳。
2. 核心解密該外掛的密鑰，交給外掛的 `verifyCallback`。
3. 外掛回傳訂單編號與供應商參考號，**沒有金額欄位**。
4. 核心用先前建立的訂單金額入帳。回呼本文裡的金額不會被採用。
5. 同一筆訂單與同一個參考號再來一次，回 200 且不再發事件。

官方的綠界與歐付寶工人目前固定回 `not_implemented`。它們沒有帳本可以寫。

贊助人名稱、留言與聊天文字在型別上是 `UntrustedText`。疊層現在不渲染這些文字。消毒留到之後的疊層與語音。

## 權限

第一階段只有核心允許清單上的官方外掛能使用 `payments.provider`、`secrets`、`network`。清單是明確的 id，不是看到 `official.` 前綴就放行。`events.emit` 也不能發送 `s4n.donation.created`、`succeeded`、`failed`。

社群外掛的預設是 `events.subscribe`、`overlay.slot`、`dashboard.settings`。

## 認證還是佔位

登入路由沒有掛上。預定的做法寫在 `apps/api/src/auth/constants.ts`：

- Session cookie 名稱 `s4n_session`，`httpOnly`、`Secure`、`SameSite=Lax`，值是伺服器上的工作階段 id
- 密碼演算法預定為 Argon2id（記憶體 19 MiB、時間成本 2、平行度 1）。這次沒有安裝原生模組
- 會改變狀態的儀表板請求要通過來源允許清單。本機會同時接受 `localhost` 與 `127.0.0.1`
- 付款回呼不是瀏覽器請求，不看 Origin，改由外掛驗簽
- 回呼與設定寫入有單一行程的固定窗口限流。多個 API 實例不會共用計數

這不是完整的認證產品，也還沒有內容安全政策。
