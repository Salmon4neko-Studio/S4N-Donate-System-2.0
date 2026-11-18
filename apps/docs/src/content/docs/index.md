---
title: S4N DONATE SYSTEM 2.0
description: 模組化贊助平台。綠界與歐付寶可以開單。
---

這份文件描述 **S4N DONATE SYSTEM 2.0**：營運者登入、外掛管理、疊層事件，以及綠界與歐付寶的信用卡贊助。

:::note
English. These docs are written in Traditional Chinese. A short English summary is at the bottom of the repository README.
:::

優先順序是安全、美感，然後才是開發容易。核心擁有帳本、付款介面、事件、疊層、外掛密鑰與權限。功能以外掛的形式掛上來。

儀表板、贊助頁與 OBS 提醒使用同一套本機字體：jf open 粉圓 2.1（justfont，SIL OFL 1.1）。檔案在 `packages/design-tokens/fonts/`，不連外部字型服務。

## 現在可以用的

- 第一位營運者的初次設定、登入、登出與伺服器端工作階段
- 外掛庫：依 manifest 列出、啟用或停用、填寫設定。密文欄位只回報已設定或尚未設定
- 測試贊助：送到疊層，不寫入帳本
- 帳本：待付款、已付款、未成功
- 贊助頁：綠界與歐付寶信用卡一次付清
- 贊助提醒：OBS 瀏覽器來源用網址裡的權杖連線，顯示名稱、金額與留言
- Twitch 聊天疊層：伺服器以匿名身分讀取聊天室，OBS 網址仍只用疊層權杖
- 型別化事件，含 `s4n.donation.test` 與付款成功、失敗。事件寫在 PostgreSQL，斷線可以依序號補上
- 以 `S4N_MASTER_KEY` 做 AES-256-GCM 的密文儲存
- 付款回呼 `/api/payments/:pluginId/callback`。外掛只驗證，核心才寫帳

## 還沒有的

- ATM、超商代碼，以及其他付款方式
- YouTube 聊天連接器（Twitch 已有。下一個來源沿用同一份聊天事件，不必改聊天疊層）
- 外掛市集
- 目標計算、跑馬燈、語音合成
- 多個 API 實例共用的登入限流（事件紀錄已經在 PostgreSQL，見 [事件紀錄](/guides/events/)）

下一步請看 [本機開發](/guides/local-dev/)，登入與 OBS 見 [登入、外掛與疊層](/guides/operator/)，事件怎麼留下來見 [事件紀錄](/guides/events/)，金流見 [綠界與歐付寶](/guides/payments/)。
