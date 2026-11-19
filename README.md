# S4N DONATE SYSTEM 2.0

開源實況主贊助平台。這不是舊系統的遷移。綠界與歐付寶可開信用卡、ATM、超商代碼與超商條碼。

優先順序是安全、美感，然後才是開發容易。核心擁有帳本、付款介面、事件匯流排、疊層外殼、外掛密鑰與權限。功能以外掛掛上。文件與介面文字以繁體中文為主。

## 這個骨架有什麼

- `@s4n/events`：`s4n.donation.created` / `succeeded` / `failed`、`s4n.chat.message` / `delete` / `clear`、`s4n.goal.updated`、`s4n.tts.request`、`s4n.media.now_playing`
- `@s4n/plugin-sdk`：外掛規格 0.1、權限，以及不能寫帳的付款介面
- 官方外掛清單：綠界與歐付寶的信用卡、ATM、超商代碼、超商條碼，加上提醒、Twitch 聊天來源、聊天疊層，以及目標、跑馬燈、語音的佔位
- API：Argon2id 登入、AES-256-GCM 密文設定、`/api/payments/:pluginId/callback`、帶權杖的疊層 WebSocket
- 儀表板（初次設定、外掛市集、帳本、測試贊助）、贊助頁，以及贊助提醒疊層
- Starlight 文件，以及 Docker Compose

## 這個骨架故意沒做

- YouTube 聊天（Twitch 聊天疊層已有。下一個來源沿用同一份事件）
- 目標計算、跑馬燈、語音合成
- 多個 API 實例共用的登入限流（事件紀錄已在 PostgreSQL）

畫面若寫著尚未實作，那就是還沒有。不要把空狀態讀成「今天沒有贊助」。

## 需求

- Node.js 22
- pnpm 10（`packageManager` 已指定 10.33.4）
- 可選：Docker，用來跑 PostgreSQL 或整組 Compose

## 安裝與開發

```bash
pnpm install
pnpm dev
```

沒有 `.env` 時，API 會讀 `.env.example`。要改設定再複製，並自己產生主金鑰：

```bash
cp .env.example .env
openssl rand -base64 32
```

| 服務 | 位址 |
| --- | --- |
| API | http://127.0.0.1:8787 |
| 儀表板與贊助頁 | http://127.0.0.1:5180 |
| OBS 疊層 | http://127.0.0.1:5181 |
| 文件 | http://127.0.0.1:4321 |

測試不需要資料庫。登入、外掛設定與疊層權杖需要 PostgreSQL：

```bash
docker compose up -d postgres
pnpm db:migrate
```

檢查：

```bash
pnpm typecheck
pnpm test
```

## Docker Compose

本機：

```bash
docker compose up --build
```

服務是 `postgres`、`api`、`web`、`overlay`、`docs`。資料庫密碼 `s4n_dev_password` 與全零的 `S4N_MASTER_KEY` 只給本機。`S4N_ENV=production` 會拒絕那把金鑰。web、overlay、docs 在容器裡聽 8080。瀏覽器打頁面自己的 `/api` 與 `/ws`。

正式環境用 `compose.prod.yaml`：Caddy 終止 TLS，儀表板與 API 同一個網域，疊層用另一個主機名，Postgres 不發布埠。步驟、備份與金流通知網址寫在文件站的「正式環境」。CI 在拉取要求上跑型別檢查與測試（含 PostgreSQL 的 `LISTEN`），推上 `main` 或 `v*` 標籤時把映像推到 `ghcr.io/salmon4neko-studio/s4n-api`、`s4n-web`、`s4n-overlay`、`s4n-docs`。

## 目錄

```text
apps/api          Hono、Prisma、PostgreSQL、疊層 WebSocket
apps/web          Vite、React 19、儀表板 / 贊助頁 / 外掛庫
apps/overlay      OBS 瀏覽器來源（贊助提醒、聊天疊層）
apps/docs         Starlight（繁體中文）
packages/events   事件契約
packages/plugin-sdk
packages/design-tokens
plugins/ecpay     綠界，含密文設定
plugins/opay      歐付寶，含密文設定
plugins/alerts    贊助提醒
plugins/twitch-chat  Twitch IRC 來源
plugins/chat-overlay 聊天疊層（與平台無關）
plugins/goals     佔位
plugins/ticker    佔位
plugins/tts       佔位
plugins/example-thanks  可編譯的社群疊層範例（未進官方目錄）
```

外掛規格寫在文件站的「外掛規格 0.1」。授權是 MIT。

## 這份骨架自己定下來的事

簡報沒有指定、但程式必須有一個選擇的部分：

- **Prisma 7.10**，不是還在候選階段的 Prisma 8。用戶端放在 `apps/api/generated`，連線使用 `@prisma/adapter-pg`。
- **TypeScript 5.9**。Prisma 7 的文件以此為準，沒有跟到 TypeScript 7。
- 付款介面放在 `@s4n/plugin-sdk`，API 重新導出使用方式。官方外掛因此不會依賴 API，也碰不到帳本。
- 密文欄位的標記是 JSON Schema 的 `x-s4n-secret: true`。加密的附加資料綁住外掛 id 與欄位名。
- 官方外掛是明確允許清單，不是 `official.` 前綴。
- TWD 的最小單位訂為 1 元，因為綠界與歐付寶收整數元。贊助金額的上下限是 `S4N_DONATION_MIN_TWD` 與 `S4N_DONATION_MAX_TWD`，預設 30 與 20000。
- 付款通知與瀏覽器導回的網址用 `S4N_PUBLIC_BASE_URL`。正式環境必填。本機沒設時是 `http://127.0.0.1:8787`。正式站由 Caddy 把這個來源上的 `/api` 轉到 API。
- 正式環境的疊層用獨立主機名（`S4N_OVERLAY_HOST`），不放在儀表板的 `/overlay`。儀表板自己有這個路徑，預覽 iframe 也要跟登入頁不同來源。兩個主機名都轉發 `/api` 與 `/ws`，所以前端用相對路徑，不把 `localhost:8787` 寫進映像。
- `S4N_TRUST_PROXY=1` 時，限流用 `X-Forwarded-For` 的最後一跳，要求網址改用邊緣代理的 scheme 與 host。正式 Compose 會打開它，而且不發布 API 埠。
- 綠界與歐付寶只做信用卡一次付清。檢查碼依兩家目前的 AIO 附錄（SHA-256、EncryptType=1）。正式站不把模擬付款入帳。
- 儀表板的跨站請求防護是來源允許清單，加上 `SameSite=Lax` 的 `s4n_session`。密碼雜湊用 `hash-wasm` 的 Argon2id，參數在 `apps/api/src/auth/constants.ts`，沒有另裝原生模組。`Secure` 只在 `S4N_ENV=production` 打開。
- 事件寫在 PostgreSQL 的 `EventLog`，用 `LISTEN`/`NOTIFY` 讓多個 API 程序看見同一條紀錄。客戶端帶最後的序號重連，至少送達一次，並用事件 id 排除重複。預設保留 7 天，聊天 24 小時。測試贊助進事件紀錄，不進帳本。登入限流仍在單一程序的記憶體裡。Twitch 徽章快取也是，因為裡面有短暫的應用程式權杖。
- 測試贊助是 `s4n.donation.test`，不寫入帳本。疊層權杖以 SHA-256 查找，並用主金鑰密封，方便儀表板再次顯示網址。
- 開發用主金鑰是 32 個零位元組。正式環境拒絕它。
- 儀表板與公開贊助頁以 Tocas UI 5 為主，紙色、橘色、靛藍對到它的 CSS 變數。實心按鈕底色是 `#f28500`，字是 `#1a1512`（對比 7.01:1）。淺底小字用 `#995400`。Tocas 沒有的版面（側欄在手機上的橫向導覽、OBS 預覽畫布）用自訂元件補上。OBS 疊層的提醒卡維持紙色，左邊線用 `#f28500`。
- 儀表板預設淺色，側欄可以切換 Tocas 暗色。公開贊助頁維持淺色。字體是本機自託管的 jf open 粉圓 2.1（justfont，SIL OFL 1.1，https://github.com/justfont/open-huninn-font/releases/tag/v2.1）。官方 `jf-openhuninn-2.1.ttf` 轉成 WOFF2，放在 `packages/design-tokens/fonts/`，旁邊是 `OFL.txt`。12,260 個字形都保留，沒有再裁切。內文與標題同一個家族，`font-display: swap`，不連 Google Fonts 或其他字型 CDN。
- Twitch 聊天由來源外掛 `official.twitch-chat` 連到 `wss://irc-ws.chat.twitch.tv`，用匿名 `justinfan`。選填的 Client ID / Client Secret 走既有的 AES-256-GCM 密文欄位，不放進 OBS 網址。顯示外掛 `official.chat-overlay` 只訂閱正規化事件，之後的 YouTube 來源不必改它。測試贊助可以混進聊天，但仍然不寫帳本。
- 外掛市集的官方索引用 Ed25519 簽名，公鑰釘在 `apps/api/src/plugins/marketplace/pinned-key.ts`。私鑰不在版本庫。套件摘要是 `s4n-plugin.json` 的 SHA-256。金流只允許綠界與歐付寶。社群外掛只有疊層與儀表板那組權限可以記下安裝，而且不會執行程式。安裝與權限變更寫進 `s4n.plugin.changed`，不含密文。

## English

The dashboard and public donate pages use Tocas UI, themed with the paper, orange, and indigo tokens. Body and headings share self-hosted jf open 粉圓 2.1 (justfont, SIL OFL 1.1; https://github.com/justfont/open-huninn-font/releases/tag/v2.1). The OBS overlay stays on its own styles and the same family. Operators can sign in, install official plugins from a signed registry, and preview a test donation on the alerts overlay. Payment plugins stay official-only. Twitch chat is read anonymously on the server and shown by a separate chat overlay; optional Twitch credentials stay encrypted and never go on the OBS URL. YouTube chat is not in this version. ECPay and O'Pay can open a credit-card checkout; the ledger amount is the server order, and a test donation is still not written to the ledger. Set `S4N_PUBLIC_BASE_URL` so provider callbacks are not built from an internal host. Production uses `compose.prod.yaml`: Caddy, the overlay on its own hostname, Postgres unpublished, and images on `ghcr.io/salmon4neko-studio`. The Traditional Chinese production guide has the checklist. Login needs PostgreSQL. Donation, chat, and plugin-audit events are appended there too, so an overlay can replay from the last sequence after a restart; delivery is at-least-once and clients dedupe by event id. Plugin audit events are not forwarded to OBS. The login rate limit and the Twitch badge cache stay in one process. See the Traditional Chinese sections above for ports, setup, and the decisions this tree had to make.
