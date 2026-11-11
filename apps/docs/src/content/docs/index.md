---
title: S4N DONATE SYSTEM 2.0
description: 模組化贊助平台的骨架。這不是已經可以收款的成品。
---

這份文件描述 **S4N DONATE SYSTEM 2.0**：營運者登入、外掛管理、疊層事件，以及還沒接上的付款。

:::note
English. These docs are written in Traditional Chinese. A short English summary is at the bottom of the repository README.
:::

優先順序是安全、美感，然後才是開發容易。核心擁有帳本、付款介面、事件、疊層、外掛密鑰與權限。功能以外掛的形式掛上來。

## 現在可以用的

- 第一位營運者的初次設定、登入、登出與伺服器端工作階段
- 外掛庫：依 manifest 列出、啟用或停用、填寫設定。密文欄位只回報已設定或尚未設定
- 測試贊助：送到疊層，不寫入帳本
- 帳本列表（付款接上之前是空的）
- 贊助提醒：OBS 瀏覽器來源用網址裡的權杖連線，顯示名稱、金額與留言
- 型別化事件，含 `s4n.donation.test`
- 以 `S4N_MASTER_KEY` 做 AES-256-GCM 的密文儲存
- 付款回呼路由 `/api/payments/:pluginId/callback`。外掛只驗證，核心才寫帳

## 還沒有的

- 綠界、歐付寶的真實 API
- Twitch、YouTube 聊天連接器
- 外掛市集
- 目標計算、跑馬燈、語音合成
- 多個 API 實例共用的事件匯流排與限流

下一步請看 [本機開發](/guides/local-dev/)，登入與 OBS 見 [登入、外掛與疊層](/guides/operator/)。
