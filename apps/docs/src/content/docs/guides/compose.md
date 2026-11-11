---
title: Docker Compose
description: 用 Compose 啟動 PostgreSQL、API、儀表板、疊層與文件。
---

Compose 是第一條部署路徑，不綁定特定雲端。映像是骨架用的，裡面留著 TypeScript 執行器與 Prisma CLI，不是收斂過的正式映像。

在儲存庫根目錄：

```bash
docker compose up --build
```

| 服務 | 對外埠 |
| --- | --- |
| postgres | 5432 |
| api | 8787 |
| web | 5180 |
| overlay | 5181 |
| docs | 4321 |

API 容器會先執行 `prisma migrate deploy`，再聽 8787。瀏覽器仍然用 `http://localhost:8787` 呼叫 API，因為 `VITE_API_URL` 在建置儀表板時寫死成主機位址，不是 Docker 網路裡的 `api`。

## 本機預設，不是機密

Compose 的資料庫密碼是 `s4n_dev_password`。主金鑰若沒有從環境覆蓋，會使用 `.env.example` 裡那把全零金鑰，而且 `S4N_ENV` 維持 `development`。

把這組設定暴露到網際網路之前，至少要：

1. 用 `openssl rand -base64 32` 產生 `S4N_MASTER_KEY`，並設 `S4N_ENV=production`
2. 換掉資料庫密碼
3. 把 `S4N_DASHBOARD_ORIGIN` 改成真正的儀表板來源

登入已經接上，細節見 [安全性](/guides/security/)。金鑰輪替、正式憑證，以及多個 API 實例共用的限流與事件匯流排，仍然沒有。
