---
title: 本機開發
description: 用一個 pnpm dev 啟動 API、儀表板、OBS 疊層與文件。
---

需要 Node.js 22 與 pnpm 10。PostgreSQL 可以之後再用 Compose 補上；沒有資料庫時，畫面與測試仍然能跑，健康檢查會顯示資料庫未連線。

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

儀表板有三個殼：概況、外掛庫、贊助頁。它們會告訴你哪一段還沒接上，不會假裝已經可以收款。

OBS 瀏覽器來源使用疊層網址。加上 `?transparent=1` 會改成透明底。

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

事件與外掛清單的形狀改了，型別檢查應該要失敗。密文、回呼金額與權限的行為在 API 測試裡。
