---
title: S4N DONATE SYSTEM 2.0
description: 模組化贊助平台的骨架。這不是已經可以收款的成品。
---

這份文件描述 **S4N DONATE SYSTEM 2.0** 的骨架：核心契約、官方外掛清單，以及怎麼在本機把外殼跑起來。

:::note
English. These docs are written in Traditional Chinese. A short English summary is at the bottom of the repository README.
:::

優先順序是安全、美感，然後才是開發容易。核心擁有帳本、付款介面、事件、疊層外殼、外掛密鑰與權限。功能以外掛的形式掛上來。部署之後，營運者再從外掛庫啟用服務。

## 這次有的

- 型別化事件：`s4n.donation.*`、`s4n.chat.message`、`s4n.goal.updated`、`s4n.tts.request`、`s4n.media.now_playing`
- 外掛規格 0.1，以及綠界、歐付寶的設定契約
- 以 `S4N_MASTER_KEY` 做 AES-256-GCM 的密文儲存
- 付款回呼路由 `/api/payments/:pluginId/callback`。外掛只驗證，核心才寫帳
- 儀表板、贊助頁、外掛庫與 OBS 疊層的畫面外殼
- Docker Compose

## 這次故意沒有的

- 綠界、歐付寶的真實 API
- Twitch、YouTube 聊天連接器
- 外掛市集
- 提醒、目標、跑馬燈、語音的實作
- 完整登入，以及正式環境的加固

下一步請看 [本機開發](/guides/local-dev/)。
