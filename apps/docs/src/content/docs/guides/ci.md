---
title: CI 與映像
description: 拉取要求上跑的檢查，以及推到 GHCR 的映像標籤。
---

工作流程在 `.github/workflows/`。權限只開作業需要的範圍。

## CI

`.github/workflows/ci.yml` 在拉取要求，以及推上 `main` 時執行。權限只有 `contents: read`。

1. `pnpm install --frozen-lockfile`
2. 對服務裡的 PostgreSQL 16 執行 `prisma migrate deploy`
3. `pnpm typecheck`
4. 根目錄的 `package.json` 若有 `lint` 腳本才執行 `pnpm lint`。這個儲存庫目前沒有
5. `pnpm test`

測試會跑 API、儀表板，以及有 `test` 腳本的外掛。疊層目前沒有測試腳本，遞迴測試會略過它。`DATABASE_URL` 指到工作流程裡的 Postgres，所以事件紀錄的 `LISTEN`/`NOTIFY` 測試會真的跑，不會略過。CI 使用開發用的資料庫密碼，那不是正式環境的密鑰。

## 映像

`.github/workflows/publish.yml` 在推上 `main`，或推上 `v1.2.3` 這種標籤時建置並推送。作業權限是 `contents: read` 與 `packages: write`。拉取要求不會推映像。

| 映像 | Dockerfile |
| --- | --- |
| `ghcr.io/salmon4neko-studio/s4n-donate-system-2.0-api` | `apps/api/Dockerfile` |
| `ghcr.io/salmon4neko-studio/s4n-donate-system-2.0-web` | `apps/web/Dockerfile` |
| `ghcr.io/salmon4neko-studio/s4n-donate-system-2.0-overlay` | `apps/overlay/Dockerfile` |
| `ghcr.io/salmon4neko-studio/s4n-donate-system-2.0-docs` | `apps/docs/Dockerfile` |

標籤：

- 該次提交的完整 sha
- `latest`（推上 `main` 或版本標籤時）
- 版本標籤另有 `1.2.3`、`1.2`、`1`

平台是 `linux/amd64`。正式 Compose 與 Coolify Compose 的 `S4N_IMAGE_TAG` 都填上面其中一個。用 sha 可以把某一台機器釘在一次建置上。Coolify 怎麼拉這些映像，見 [Coolify](/guides/coolify/)。

API 映像是多階段的：建構階段產生 Prisma Client，再用 `pnpm deploy --prod` 留下正式依賴。執行階段以 `node` 使用者跑，啟動時先 `prisma migrate deploy`。`tsx` 是執行期依賴，因為 API 與工作區套件仍是 TypeScript。web、overlay、docs 的最後階段是非 root 的 nginx，聽 8080。

Caddy 使用官方映像，在容器裡為了綁 80/443 而以 root 執行。它不跑應用程式。

## 擁有者要確認的事

第一次推送會在 GHCR 建立套件。請到套件頁確認可見範圍。私有套件要在伺服器上 `docker login ghcr.io`，權杖至少要有 `read:packages`。若組織限制 Actions 寫入套件，發布工作流程會在登入或推送時失敗，需要在組織設定裡允許這個儲存庫的 `GITHUB_TOKEN` 寫入 packages。

伺服器怎麼拉映像、怎麼設定網域，見 [正式環境](/guides/production/)。

## Cloudflare Workers

文件站可以另外用 Cloudflare Workers 建置。Workers 的建置指令是：

```bash
pnpm --filter s4n-donate-system-2.0-docs build
```

套件名稱是 `s4n-donate-system-2.0-docs`。`pnpm --filter @s4n/docs build` 已經對不到這個套件。
