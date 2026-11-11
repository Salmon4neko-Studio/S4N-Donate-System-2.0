---
title: 本機開發
description: 用一個 pnpm dev 啟動 API、儀表板、OBS 疊層與文件。
---

需要 Node.js 22 與 pnpm 10。測試不需要資料庫。要登入、儲存外掛設定或產生疊層網址，需要 PostgreSQL。

## 安裝

在儲存庫根目錄：

```bash
pnpm install
```

若要覆寫預設值，複製環境檔再產生自己的主金鑰：

```bash
cp .env.example .env
openssl rand -base64 32
```

沒有 `.env` 時，API 會讀取 `.env.example`。那個主金鑰是 32 個零位元組，只給本機使用。`S4N_ENV=production` 會拒絕它。

## 啟動

```bash
pnpm dev
```

這個指令會先產生 Prisma Client，再同時啟動四個程序。

| 服務 | 位址 |
| --- | --- |
| API | http://127.0.0.1:8787 |
| 儀表板與贊助頁 | http://127.0.0.1:5180 |
| OBS 疊層 | http://127.0.0.1:5181 |
| 文件 | http://127.0.0.1:4321 |

儀表板會先要求初次設定或登入。進去之後有概況、帳本、外掛庫、疊層網址，以及公開的贊助頁。贊助頁仍然不會向綠界或歐付寶開單。

OBS 的做法寫在 [登入、外掛與疊層](/guides/operator/)。疊層網址帶有權杖，並加上 `transparent=1`。`preview=1` 只是瀏覽器裡的棋盤預覽。

## 資料庫

```bash
docker compose up -d postgres
pnpm db:migrate
```

本機預設連線是 `postgresql://s4n:s4n_dev_password@localhost:5432/s4n`。這個密碼寫在 Compose 裡，只給開發用。

## 檢查

```bash
pnpm typecheck
pnpm test
```

`pnpm typecheck` 與 `pnpm test` 應該通過。登入、密文、權限、疊層權杖與測試贊助都在 API 測試裡。事件匯流排與登入限流是單一程序的記憶體實作。
