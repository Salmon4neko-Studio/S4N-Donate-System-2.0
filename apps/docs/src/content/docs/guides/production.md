---
title: 正式環境
description: 用 Caddy、Compose 與 GHCR 映像把儀表板、疊層與 API 放到一台伺服器上。
---

`compose.yaml` 只給本機開發。正式環境用 `compose.prod.yaml`。密鑰與網域都寫在伺服器的 `.env`，Compose 缺任何一個必填變數就不會啟動。Postgres 不對外面開放。對外只有 Caddy 的 80 與 443。

映像在 `ghcr.io/salmon4neko-studio/s4n-api`、`s4n-web`、`s4n-overlay`、`s4n-docs`。標籤見 [CI 與映像](/guides/ci/)。

## 為什麼疊層用另一個主機名

儀表板、贊助頁與 API 在同一個網域，例如 `https://donate.example`。疊層在 `https://overlay.donate.example`。

同一個網域底下如果把疊層放在 `/overlay`，會蓋掉儀表板自己的「疊層」頁。預覽用的 iframe 也是刻意跟儀表板不同來源，避免那個畫面帶著營運者的登入 Cookie。OBS 瀏覽器來源只是再開一個網址，多一個 DNS 記錄即可。

兩個主機名都會把 `/api` 與 `/ws` 轉到 API。儀表板與疊層因此用頁面自己的來源呼叫 API，映像裡不會寫進 `localhost:8787`。

文件站預設不部署。要的話再加第三個主機名，見下面的「文件」。

## 準備伺服器

一台可以跑 Docker Engine 與 Docker Compose v2 的機器。防火牆只放行 SSH、80、443。不要把 5432、8787、5180、5181 開到網際網路上。正式 Compose 本來就不會發布那些埠。

DNS 指到這台機器的公開位址：

| 名稱 | 例子 | 用途 |
| --- | --- | --- |
| `S4N_DOMAIN` | `donate.example` | 儀表板、贊助頁、付款通知 |
| `S4N_OVERLAY_HOST` | `overlay.donate.example` | OBS 疊層 |
| `S4N_DOCS_HOST` | `docs.donate.example` | 選用。不設就不部署文件 |

`S4N_TLS_MODE=acme` 時，Caddy 會向 Let's Encrypt 申請憑證。80 埠必須從網際網路打得到。主機名要先解析好。

## 填寫 .env

在儲存庫根目錄做一份只留在伺服器上的 `.env`。不要提交。密碼請用十六進位，避免 `@`、`:`、`/`、`$` 弄壞連線字串：

```bash
openssl rand -hex 24
openssl rand -base64 32
```

第二行是 `S4N_MASTER_KEY`。它必須是標準 Base64，解出來剛好 32 位元組。全零那把開發金鑰在正式環境會被拒絕。

```bash
POSTGRES_USER=s4n
POSTGRES_PASSWORD=貼上 openssl rand -hex 24 的結果
POSTGRES_DB=s4n
S4N_MASTER_KEY=貼上 openssl rand -base64 32 的結果
S4N_DOMAIN=donate.example
S4N_OVERLAY_HOST=overlay.donate.example
S4N_DASHBOARD_ORIGIN=https://donate.example
S4N_OVERLAY_ORIGIN=https://overlay.donate.example
S4N_PUBLIC_BASE_URL=https://donate.example
S4N_TLS_MODE=acme
S4N_ACME_EMAIL=ops@example.com
S4N_BACKUP_RETENTION=14
S4N_IMAGE_TAG=latest
```

`S4N_PUBLIC_BASE_URL` 與 `S4N_DASHBOARD_ORIGIN` 都是 `https://` 加上 `S4N_DOMAIN`，不要帶路徑，也不要寫埠號。付款通知是 `https://donate.example/api/payments/...`，由 Caddy 轉進 API。`S4N_ENV=production` 與 `S4N_TRUST_PROXY=1` 寫在 Compose 裡，不用放進 `.env`。

主金鑰要另外抄一份到這台機器以外的地方。沒有它，已經密封的綠界、歐付寶與 Twitch 密文解不開。這個版本沒有換鑰流程。

## 啟動

映像若已在 GHCR，而且套件允許這台機器拉取：

```bash
docker login ghcr.io
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

套件若是私有的，`docker login` 要用具備 `read:packages` 的個人存取權杖。第一次從 `main` 推上 GHCR 之後，到 GitHub 的 Packages 確認可見範圍，必要時把套件跟這個儲存庫連起來。

還沒有映像、或要在這台機器上從原始碼建置時：

```bash
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d
```

API 容器會先跑 `prisma migrate deploy`，成功才聽 8787。確認：

```bash
docker compose -f compose.prod.yaml ps
curl -fsS https://donate.example/api/health
```

健康檢查應看到 `"database":"up"`。接著用瀏覽器打開 `https://donate.example` 做初次設定，再到 `https://overlay.donate.example/?preview=1` 確認疊層頁有出來。OBS 用的網址仍從儀表板的「疊層」頁複製，主機會是 `S4N_OVERLAY_ORIGIN`。

本機想先看 Caddy 怎麼轉，把網域設成 `donate.localhost` 與 `overlay.localhost`，`S4N_TLS_MODE=internal`。Caddy 會發自己的憑證，瀏覽器預設不信任。這只適合檢查，不要拿來收付款。

## 升級

先做一次備份，再換標籤。`S4N_IMAGE_TAG` 可以是 `latest`、完整 git sha，或 `v1.2.3` 這種版本。

```bash
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

新的 API 程序啟動時會再跑遷移。遷移失敗時容器不會進入服務，舊程序若已被替換，就用上一份映像標籤與備份還原。

## 備份與還原

`backup` 服務每天對 Postgres 做一次 `pg_dump`（custom format），檔名像 `s4n-20261119T040000Z.dump`，放在 volume `s4n_prod_backups`。`S4N_BACKUP_RETENTION=14` 表示只留最新 14 份。第一份成功之後，`docker compose ps` 裡的 backup 會變成 healthy。

把 dump 拷出機器，不要只留在同一顆磁碟：

```bash
mkdir -p backups
docker compose -f compose.prod.yaml cp backup:/backups/. backups/
```

不想跑這個服務時，用主機 cron 呼叫 `deploy/backup-cron.sh`。它改寫到儲存庫旁邊的 `backups/`，同樣依 `S4N_BACKUP_RETENTION` 刪舊檔。那支腳本會讀伺服器上的 `.env`，不要把它的輸出貼到別處。

還原會先停 API，再把 dump 灌回同一個資料庫，然後啟動 API：

```bash
docker compose -f compose.prod.yaml stop api
docker compose -f compose.prod.yaml exec -T postgres \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/s4n-20261119T040000Z.dump
docker compose -f compose.prod.yaml start api
```

`deploy/restore.sh backups/s4n-20261119T040000Z.dump` 是同一件事。`pg_restore` 對「物件原本就不存在」有時會以結束代碼 1 離開，先看輸出再決定要不要重跑。還原不會找回 `.env` 裡的主金鑰。主金鑰與資料庫要一起留。

贊助提醒的音效不在資料庫裡。API 以 `node` 使用者寫入 `/data/alert-sounds`，正式 Compose 把這個目錄掛在 volume `s4n_prod_alert_sounds`。映像裡先建好這個目錄並交給 `node`，新的 volume 會沿用這個擁有者，所以非 root 的 API 寫得進去。換容器不會清掉檔案。`pg_dump` 不含這些檔，要另外拷：

```bash
mkdir -p alert-sounds
docker compose -f compose.prod.yaml cp api:/data/alert-sounds/. alert-sounds/
```

還原時先確定 API 沒在寫，再拷回去：

```bash
docker compose -f compose.prod.yaml cp alert-sounds/. api:/data/alert-sounds/
```

只有資料庫、沒有這個 volume 時，已上傳的提示音會變回靜音，設定頁可以再傳一次。

## 日誌

Compose 使用 json-file，每個容器大約保留 5 個 10 MB 檔。

```bash
docker compose -f compose.prod.yaml logs -f api
docker compose -f compose.prod.yaml logs -f caddy
docker compose -f compose.prod.yaml logs -f backup
```

Caddy 憑證在 volume `s4n_prod_caddy_data`。不要把 `/data` 裡的帳號金鑰提交進版本庫。

## 金流通知網址

綠界與歐付寶要打得到的是 `S4N_PUBLIC_BASE_URL`，也就是儀表板那個網域，不是疊層網域。結帳表單會自己帶這些網址。廠商後台若要再填一次，用下面的形狀，把 `{id}` 換成外掛 id，例如 `official.ecpay` 或 `official.ecpay-atm`：

| 用途 | 網址 |
| --- | --- |
| ReturnURL | `https://donate.example/api/payments/{id}/callback` |
| PaymentInfoURL | `https://donate.example/api/payments/{id}/payment-info` |
| OrderResultURL | `https://donate.example/api/payments/{id}/return` |
| ClientRedirectURL | `https://donate.example/api/payments/{id}/payment-redirect` |
| ClientBackURL | `https://donate.example/donate/cancelled` |

必須是 443 上的公開 https。Caddy 把 `/api` 轉給 API，並覆寫 `X-Forwarded-Proto` 與 `X-Forwarded-Host`。API 在 `S4N_TRUST_PROXY=1` 時用最後一跳當作客戶端位址，也把要求的網址改成外面的 https。付款網址本身仍只從 `S4N_PUBLIC_BASE_URL` 組，不用這次請求的 Host。瀏覽器導回 `S4N_DASHBOARD_ORIGIN` 的 `/donate/result` 或 `/donate/pay`。

Cookie 是 `s4n_session`，`HttpOnly`、`SameSite=Lax`。`S4N_ENV=production` 會加 `Secure`。儀表板與 API 同一台主機，所以這顆 Cookie 是第一方。會改狀態的請求仍只接受 `S4N_DASHBOARD_ORIGIN`。疊層來源可以讀 CORS 預檢，不能拿來改帳。

## 文件

不設 `S4N_DOCS_HOST` 就沒有文件站。要加時：

```bash
# .env
S4N_DOCS_HOST=docs.donate.example
```

DNS 指好之後：

```bash
docker compose -f compose.prod.yaml --profile docs up -d
```

Caddy 會為那個主機名另外簽一張憑證，並轉到 docs 容器。文件不經過 API。

## 檢查清單

上線前再對一次 [安全性](/guides/security/) 裡的正式環境清單：主金鑰有線下備份、沒有使用開發密碼或全零金鑰、防火牆沒有打開資料庫。
