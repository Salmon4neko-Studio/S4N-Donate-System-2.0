---
title: Coolify
description: 用 Coolify v4 的 Docker Compose 部署。80 與 443 交給 Coolify 的代理，Caddy 只在內部轉送。
---

`compose.prod.yaml` 自己聽 80 與 443，並向 Let's Encrypt 申請憑證。Coolify v4 的代理已經佔用這兩個埠。這時用儲存庫根目錄的 `compose.coolify.yaml`。它不取代正式 Compose，本機直接用 Docker 時仍走 [正式環境](/guides/production/)。

Coolify 的代理（Traefik 或 Caddy）終止 TLS。我們的 Caddy 不發布主機埠、不做 ACME，只在 Docker 網路裡聽 80。儀表板主機名與疊層主機名都進這一台 Caddy，`/api` 與 `/ws` 仍轉到 API。Postgres 不發布埠。`S4N_ENV=production`。

官方說明：

- [Docker Compose build pack](https://coolify.io/docs/applications/builds/docker-compose)
- [Compose 的環境變數與 magic 變數](https://coolify.io/docs/knowledge-base/docker/compose)
- [Service 的 Compose 與網域](https://coolify.io/docs/services/configuration/docker-compose)
- [應用程式的 Domains](https://coolify.io/docs/applications/configuration/general)
- [環境變數](https://coolify.io/docs/services/configuration/environment-variables)
- [私有映像登錄](https://coolify.io/docs/applications/builds/docker-registries)
- [資料庫排程備份](https://coolify.io/docs/databases/backups)

## 建立資源

從公開儲存庫建立時，Coolify 會做成一個 Application，部署會跟著分支走。

1. 打開目標 project 與 environment，選 **+ New**。
2. 選公開儲存庫，貼上 `https://github.com/Salmon4neko-Studio/S4N-Donate-System-2.0`，再選 **Check Repository**。
3. 在 **General > Build pipeline** 把 Build strategy 選成 **Compose**。
4. **Base Directory** 填 `/`。**Docker Compose Location** 填 `/compose.coolify.yaml`。
5. 同一頁打開 **Preserve repository during deployment**。Caddy 的進入點與備份腳本是從儲存庫綁進去的（`deploy/caddy/entrypoint.sh`、`deploy/backup.sh`）。部署目錄若沒留下這些檔案，Docker 會把缺少的檔案來源做成目錄，容器就起不來。
6. 儲存後看 **Docker Compose Content**。要改定義時改儲存庫再重新載入，不要把畫面上渲染過的內容當成唯一的那份。
7. 選 **Deploy**。到 **Deployment Logs** 等它跑完，再到 **Runtime Logs** 看沒有起來的服務。

只想把 YAML 貼進 Coolify、不接 Git 時，選 **+ New**，再選 **Docker Compose Empty**，把定義貼進 **Docker Compose file**，**Save**。之後用 **Edit Compose File** 修改。這條路沒有儲存庫，綁定的那兩個腳本不在 Coolify 的目錄裡，容器會起不來。請改走上面的公開儲存庫。

## 環境變數

值只填在 Coolify 的 **Environment Variables**（Service 則是 **Configuration > Environment Variables**）。不要在儲存庫做 `.env`，也不要把密鑰寫進 Compose。Compose 裡的 `${名稱:?}` 會讓 Coolify 把該變數標成必填，空著不能部署。

`S4N_ENV=production`、`S4N_TRUST_PROXY=1`、`S4N_TLS_MODE=proxy` 寫在 Compose 裡，不用另填。`S4N_DASHBOARD_ORIGIN`、`S4N_OVERLAY_ORIGIN`、`S4N_PUBLIC_BASE_URL` 由主機名組成，分別是 `https://` 加上 `S4N_DOMAIN` 或 `S4N_OVERLAY_HOST`，沒有路徑、沒有埠號。

| 名稱 | 必填 | 說明 |
| --- | --- | --- |
| `S4N_DOMAIN` | 是 | 儀表板主機名，例如 `donate.example`。不要寫 `https://` |
| `S4N_OVERLAY_HOST` | 是 | 疊層主機名，必須跟上面不同 |
| `S4N_MASTER_KEY` | 是 | `openssl rand -base64 32` 的輸出。解出來要剛好 32 位元組 |
| `SERVICE_PASSWORD_POSTGRES` | Coolify 產生 | 資料庫密碼。32 字、沒有符號。Postgres、API 的連線字串、backup 服務共用這一把 |
| `POSTGRES_USER` | 否 | 不設則 `s4n` |
| `POSTGRES_DB` | 否 | 不設則 `s4n` |
| `S4N_IMAGE_TAG` | 否 | 不設則 `latest`。也可以是完整 git sha 或 `v1.2.3` |
| `S4N_BACKUP_RETENTION` | 否 | 內建 backup 留下的份數。不設則 `14` |
| `S4N_DOCS_HOST` | 否 | 文件站主機名。還要設 `COMPOSE_PROFILES=docs` |
| `COMPOSE_PROFILES` | 否 | 只有要文件站時設成 `docs` |

主金鑰在自己的電腦產生，貼進 Coolify，再抄一份放到 Coolify 和那台伺服器以外：

```bash
openssl rand -base64 32
```

全零的開發金鑰在正式環境會被拒絕。沒有這把鑰匙，已經密封的綠界、歐付寶與 Twitch 密文解不開。這個版本沒有換鑰。

不要用 `SERVICE_BASE64_*` 或 `SERVICE_BASE64_32_*` 自動產生主金鑰。Coolify 文件寫明那個值名叫 Base64，其實是隨機英數字，不是 Base64，解出來也不會是 32 位元組。`SERVICE_REALBASE64_32_*` 才是 32 個隨機位元組再做 Base64，長度是對的，仍然不要用：鑰匙會先出現在 Coolify 裡，很容易在抄下來之前就已經拿去密封設定。

資料庫密碼用 Compose 裡的 `SERVICE_PASSWORD_POSTGRES`。Coolify 會產生 32 字、沒有符號的密碼，同一個名字在 Postgres、API、backup 是同一把，也可以放進連線字串。部署後到 Environment Variables 把這個值抄下來。想換成自己的密碼時，覆寫它，並用 `openssl rand -hex 24`。不要用含 `@`、`:`、`/`、`$` 的密碼，那會弄壞 `DATABASE_URL`。

儲存庫裡的範本是 `.env.coolify.example`。內容與下面這一段相同，只有名稱和說明，沒有真值：

```bash
# Coolify v4 的環境變數名稱。這份檔案沒有真值，不要填上密鑰再提交，也不要把它拷成 .env 放進版本庫。
# 值只填在 Coolify 的 Environment Variables。說明見文件的 Coolify 頁。

# 必填。儀表板、贊助頁與付款通知的主機名。不要加 https://，不要加路徑或埠號。
# 須與 Domains 裡指到 caddy、內部埠 80 的那個主機名相同。
# S4N_DOMAIN=

# 必填。OBS 疊層的主機名，必須跟 S4N_DOMAIN 不同。同樣不要加 https://。
# S4N_OVERLAY_HOST=

# 必填。標準 Base64，解出來剛好 32 位元組。在自己的電腦執行後，把輸出貼進 Coolify：
#   openssl rand -base64 32
# 再抄一份放在 Coolify 和這台伺服器以外。沒有它，已密封的綠界、歐付寶與 Twitch 密文解不開。這個版本沒有換鑰。
# 不要用 SERVICE_BASE64_*。Coolify 文件寫明那是隨機英數字，不是 Base64，長度也不會是 32 位元組。
# SERVICE_REALBASE64_32_* 雖是 32 個隨機位元組再做 Base64，仍不要靠它自動產生，免得鑰匙只留在 Coolify。
# S4N_MASTER_KEY=

# 資料庫密碼不寫在這個檔案。compose.coolify.yaml 使用 Coolify 產生的 SERVICE_PASSWORD_POSTGRES
# （32 字、沒有符號，可以放進連線字串）。部署後到 Environment Variables 把那個值抄下來。
# 若要換成自己的密碼，覆寫 SERVICE_PASSWORD_POSTGRES，並用：
#   openssl rand -hex 24
# 不要使用含有 @ : / $ 的密碼，也不要使用開發用的 s4n_dev_password。

# 選用。不設時使用者是 s4n，資料庫名稱也是 s4n。
# POSTGRES_USER=
# POSTGRES_DB=

# 選用。映像標籤。不設則是 latest。也可以是完整 git sha，或 v1.2.3 這種版本。
# S4N_IMAGE_TAG=

# 選用。內建 backup 服務留下的 dump 份數。不設則是 14。
# S4N_BACKUP_RETENTION=

# 選用。文件站主機名。還要另外設定 COMPOSE_PROFILES=docs，並在 Domains 把這個主機名指到 caddy 的內部埠 80。
# 不設就沒有文件站。
# S4N_DOCS_HOST=
# COMPOSE_PROFILES=
```

## 兩個網域

Compose 裡的 `SERVICE_FQDN_CADDY_80` 讓 Coolify 把 **caddy** 這個服務的網域轉到容器內部的 80。公開網址仍是一般的 443，`:80` 只告訴代理要連容器的哪一個埠。產生出來的那一個網域通常不是你的捐款網域。

在應用程式的 **Domains** 選 **Add domain**。Protocol 選 HTTPS，Domain 填 `S4N_DOMAIN` 的主機名，內部 Port 填 `80`，接收的 Service 選 **caddy**。再加一次，Domain 改成 `S4N_OVERLAY_HOST`，Port 仍是 `80`，Service 仍是 **caddy**。兩個主機名都要進同一台 Caddy。不要把網域指到 api、web 或 overlay，否則 `/api` 與 `/ws` 不會照這份 Caddyfile 轉。

Service（貼上 Compose 的那種資源）則在解析之後，於 caddy 元件的 Domains 填這兩個網址。文件站若有開，第三個主機名同樣指到 caddy 的 80，並把 `COMPOSE_PROFILES` 設成 `docs`。

DNS 把這些名稱指到 Coolify 那台機器。憑證由 Coolify 的代理申請。我們的 Caddy 看不到 443。

## 拉取 GHCR

映像是 `ghcr.io/salmon4neko-studio/s4n-donate-system-2.0-api`、`s4n-donate-system-2.0-web`、`s4n-donate-system-2.0-overlay`、`s4n-donate-system-2.0-docs`。標籤見 [CI 與映像](/guides/ci/)。這份 Compose 只有 `image`，沒有 `build`，Coolify 會拉取，不會在伺服器上從原始碼建置。

套件是公開的時，不用登入。套件是私有的時，打開側欄 **Registries**，或 **Servers** 裡那台伺服器的 **Registries**，選 **Log in**，提供者選 **GHCR**，registry 填 `ghcr.io`，使用者名稱是 GitHub 帳號，密碼是具備 `read:packages` 的權杖，再選 **Log in**。每台要拉映像的伺服器都要做一次。不要把權杖寫進儲存庫。

## 轉送與訪客位址

路徑是：訪客 → Coolify 的代理（TLS）→ 我們的 Caddy:80 → API。登入限流要用真正的訪客位址。API 在 `S4N_TRUST_PROXY=1` 時只採 `X-Forwarded-For` 的**最後一跳**，這樣客戶端不能在標頭前面塞一個假位址來換一個新的限流桶。

若 Caddy 再把 Coolify 代理的位址接在後面，最後一跳會變成代理自己，所有登入都會算成同一個位址。`S4N_TLS_MODE=proxy`（`off` 是同一種）因此做兩件事：

- `trusted_proxies static private_ranges` 加上 `trusted_proxies_strict`。連線來自私有網段時，才相信進來的 `X-Forwarded-For`，並從**右邊**取出第一個不在私有網段裡的位址。左邊多出來的值視為偽造。
- 把那個位址寫成**唯一**的 `X-Forwarded-For` 與 `X-Real-IP`。API 看到的最後一跳就是訪客。

`X-Forwarded-Proto` 固定寫成 `https`。Caddy 自己只看到 HTTP，若沿用它看到的方案，要求網址會變成 `http`。工作階段 Cookie 的 `Secure` 來自 `S4N_ENV=production`，不是來自這次請求的方案。付款網址來自 `S4N_PUBLIC_BASE_URL`，也就是 `https://` 加上 `S4N_DOMAIN`。`/ws` 仍由同一台 Caddy 轉到 API，WebSocket 升級會跟著這條代理走。

Coolify 的代理若不是私有位址，Caddy 不會採信轉送標頭，限流會看到代理的位址。公開的贊助站，訪客應是公開位址。

## 確認服務

Git 上的 Docker Compose 應用程式使用 Compose 裡的 healthcheck，不是應用程式設定裡的 Healthcheck 頁。API 容器會先跑 `prisma migrate deploy`。

用瀏覽器或 `curl` 打開儀表板網域的 `/api/health`。應看到 `"database":"up"`。疊層網域的 `/api/health` 也該是同一份 JSON。儀表板首頁是 `https://` 加上 `S4N_DOMAIN`，疊層頁是 `https://` 加上 `S4N_OVERLAY_HOST`。OBS 的網址仍從儀表板的「疊層」頁複製。

## 金流通知網址

綠界與歐付寶要打到的是儀表板那個網域，不是疊層網域。把 `{id}` 換成外掛 id，例如 `official.ecpay` 或 `official.ecpay-atm`：

| 用途 | 網址 |
| --- | --- |
| ReturnURL | `https://donate.example/api/payments/{id}/callback` |
| PaymentInfoURL | `https://donate.example/api/payments/{id}/payment-info` |
| OrderResultURL | `https://donate.example/api/payments/{id}/return` |
| ClientRedirectURL | `https://donate.example/api/payments/{id}/payment-redirect` |
| ClientBackURL | `https://donate.example/donate/cancelled` |

必須是 443 上的公開 https。其餘規則與 [正式環境](/guides/production/) 的「金流通知網址」相同。

## 備份與提示音

`backup` 服務仍在。它每天對 Postgres 做一次 `pg_dump`（custom format），檔名像 `s4n-20261119T040000Z.dump`，放在 volume `s4n_backups`。Coolify 會給 volume 加上資源前綴。`S4N_BACKUP_RETENTION` 不設則留最新 14 份。第一份成功之後，這個服務的 healthcheck 才會過。dump 要拷出那台機器，不要只留在同一顆磁碟。

也可以改用 Coolify 自己的排程備份，或兩個一起用。Postgres 在這個 Service 裡面時，打開該資料庫元件的 **Backups**，在 **Database backups** 旁選 **+ Add**，填 cron 或 `daily` 這類頻率，再選 **Add schedule**。Coolify 讀的是容器裡的 `POSTGRES_PASSWORD`、`POSTGRES_USER`、`POSTGRES_DB`，這份 Compose 有把這三個名字傳進去。還原方式見那份文件。排程備份沒有取代主金鑰的線下副本。

贊助提醒的音效在 API 容器的 `/data/alert-sounds`，對應的 named volume 是 `s4n_alert_sounds`。**Configuration > Persistent Storage**（Service 的頁面名稱是 **Persistent Storages**）看得到這個掛載，Compose 擁有的欄位在那裡是唯讀的。換容器不會清掉檔案。`pg_dump` 不含這些檔。

要確認檔案還在，用側欄 **Terminal**，在 **Start a terminal session** 選 API 那個容器，列出 `/data/alert-sounds`。要拷出機器時，在伺服器上用 `docker cp`，容器名稱以 `docker ps` 看到的為準。只有資料庫、沒有這個 volume 時，已上傳的提示音會變回靜音，設定頁可以再傳一次。
