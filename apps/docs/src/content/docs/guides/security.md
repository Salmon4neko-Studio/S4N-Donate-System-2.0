---
title: 安全性
description: 主金鑰、密文設定、營運者工作階段、疊層權杖與回呼記帳。
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

贊助人名稱、留言與聊天文字在型別上是 `UntrustedText`。贊助提醒把控制字元拿掉之後，以文字節點顯示，不把內容當成 HTML。語音仍然沒有合成。

## 權限

第一階段只有核心允許清單上的官方外掛能使用 `payments.provider`、`secrets`、`network`。清單是明確的 id，不是看到 `official.` 前綴就放行。`events.emit` 也不能發送 `s4n.donation.created`、`succeeded`、`failed` 或 `s4n.donation.test`。

社群外掛的預設是 `events.subscribe`、`overlay.slot`、`dashboard.settings`。

## 營運者認證

儀表板 API 需要工作階段。贊助頁建立贊助、付款回呼與健康檢查不需要。

- Cookie 名稱 `s4n_session`，`httpOnly`、`SameSite=Lax`。只有 `S4N_ENV=production` 會加 `Secure`，否則本機 HTTP 存不住
- 值是伺服器 `Session` 列的編號，不是瀏覽器可以自行延展的權杖
- 密碼是 Argon2id，參數在 `apps/api/src/auth/constants.ts`。雜湊由 `hash-wasm` 計算，沒有額外的原生模組
- 工作階段約 12 小時到期。超過 15 分鐘會換成新編號，到期時間不延長
- 登入有固定窗口限流。錯誤的密碼與不存在的帳號回同一種錯誤
- 初次設定在已經有營運者時會拒絕
- 會改變狀態的儀表板請求要通過來源允許清單。本機會同時接受 `localhost` 與 `127.0.0.1`
- 付款回呼不是瀏覽器請求，不看 Origin，改由外掛驗簽
- 回呼、設定與登入的限流都在單一程序的記憶體裡

## 疊層權杖

OBS 不帶登入 Cookie。疊層網址帶一組每個營運者一枚的權杖。伺服器存 SHA-256 作查找，並用主金鑰把權杖密封，這樣已登入的儀表板還可以顯示網址。重新產生會換掉這兩份資料，舊權杖立即失效。

這組網址等於通行憑證。不要提交到版本庫，也不要貼到會記錄網址的公開服務。

還沒有內容安全政策。多個 API 實例也不會共用工作階段以外的即時狀態；工作階段本身在資料庫裡。
