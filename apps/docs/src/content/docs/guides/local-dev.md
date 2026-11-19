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

儀表板會先要求初次設定或登入。進去之後有概況、帳本、市集、外掛、疊層網址，以及公開的贊助頁。外掛頁負責啟用與密文。一般設定在側欄「外掛」選單。啟用並設定綠界或歐付寶之後，贊助頁才會出現付款方式。沙盒與回呼網址見 [綠界與歐付寶](/guides/payments/)。

OBS 的做法寫在 [登入、外掛與疊層](/guides/operator/)。疊層只有一條網址，帶有權杖，並加上 `transparent=1`。這條正式網址不顯示連線或等待文字，背景保持透明。`preview=1` 是工作台的棋盤預覽，才會寫出那些狀態。

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

`pnpm typecheck` 與 `pnpm test` 應該通過。登入、密文、權限、疊層權杖與測試贊助都在 API 測試裡。事件紀錄的重送、順序、去重、重啟與保留期限也在其中；連得到已遷移的 PostgreSQL 時，會再測一次 `LISTEN`/`NOTIFY`。沒有資料庫時那一個測試會略過，其餘仍通過。登入限流仍是單一程序的記憶體計數。
