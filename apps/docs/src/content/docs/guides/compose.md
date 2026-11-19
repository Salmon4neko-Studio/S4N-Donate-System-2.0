---
title: Docker Compose
description: 本機用 Compose 啟動 PostgreSQL、API、儀表板、疊層與文件。
---

這份是本機的 `compose.yaml`。正式環境用 `compose.prod.yaml`，見 [正式環境](/guides/production/)。

在儲存庫根目錄：

```bash
docker compose up --build
```

| 服務 | 主機位址 | 容器裡 |
| --- | --- | --- |
| postgres | 5432 | 5432 |
| api | 8787 | 8787 |
| web | 5180 | 8080 |
| overlay | 5181 | 8080 |
| docs | 4321 | 8080 |

API 容器會先執行 `prisma migrate deploy`，再聽 8787。儀表板與疊層用自己頁面的 `/api` 與 `/ws`。nginx 把這兩條轉到 `api:8787`，所以映像不再把 `localhost:8787` 寫進去。直接開 API 仍然是 `http://127.0.0.1:8787`。

## 本機預設，不是機密

Compose 的資料庫密碼是 `s4n_dev_password`。主金鑰若沒有從環境覆蓋，會使用 `.env.example` 裡那把全零金鑰，而且 `S4N_ENV` 維持 `development`。

不要把這份 Compose 暴露到網際網路。正式站請改用 [正式環境](/guides/production/)：另一個網域給疊層、Caddy 終止 TLS、資料庫不發布埠，並換成自己的主金鑰。

登入已經接上，細節見 [安全性](/guides/security/)。事件紀錄跟帳本用同一顆 PostgreSQL，多個 API 程序用 `LISTEN`/`NOTIFY` 共用，見 [事件紀錄](/guides/events/)。金鑰輪替，以及多個 API 實例共用的登入限流，仍然沒有。
