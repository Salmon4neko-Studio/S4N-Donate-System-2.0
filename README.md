# S4N DONATE SYSTEM 2.0

開源實況主贊助平台的骨架。這不是成品，也不是舊系統的遷移。

優先順序是安全、美感，然後才是開發容易。核心擁有帳本、付款介面、事件匯流排、疊層外殼、外掛密鑰與權限。功能以外掛掛上。文件與介面文字以繁體中文為主。

## 這個骨架有什麼

- `@s4n/events`：`s4n.donation.created` / `succeeded` / `failed`、`s4n.chat.message`、`s4n.goal.updated`、`s4n.tts.request`、`s4n.media.now_playing`
- `@s4n/plugin-sdk`：外掛規格 0.1、權限，以及不能寫帳的付款介面
- 官方外掛清單：綠界 ECPay、歐付寶 O'Pay，加上提醒、目標、跑馬燈、語音的佔位
- API：AES-256-GCM 密文設定、`/api/payments/:pluginId/callback`、WebSocket 佔位
- 儀表板、贊助頁、外掛庫與 OBS 疊層的畫面外殼
- Starlight 文件，以及 Docker Compose

## 這個骨架故意沒做

- 綠界、歐付寶的真實 API
- Twitch、YouTube 聊天
- 外掛市集、提醒動畫、目標計算、跑馬燈、語音合成
- 完整登入與正式環境加固

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

資料庫不是 `pnpm dev` 的必要條件。要做遷移時：

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

```bash
docker compose up --build
```

服務是 `postgres`、`api`、`web`、`overlay`、`docs`。資料庫密碼 `s4n_dev_password` 與全零的 `S4N_MASTER_KEY` 只給本機。`S4N_ENV=production` 會拒絕那把金鑰。映像是骨架用的，不是收斂過的正式映像。

## 目錄

```text
apps/api          Hono、Prisma、PostgreSQL、WebSocket 佔位
apps/web          Vite、React 19、儀表板 / 贊助頁 / 外掛庫
apps/overlay      OBS 瀏覽器來源
apps/docs         Starlight（繁體中文）
packages/events   事件契約
packages/plugin-sdk
packages/design-tokens
plugins/ecpay     綠界，含密文設定
plugins/opay      歐付寶，含密文設定
plugins/alerts    佔位
plugins/goals     佔位
plugins/ticker    佔位
plugins/tts       佔位
```

外掛規格寫在文件站的「外掛規格 0.1」。授權是 MIT。

## 這份骨架自己定下來的事

簡報沒有指定、但程式必須有一個選擇的部分：

- **Prisma 7.10**，不是還在候選階段的 Prisma 8。用戶端放在 `apps/api/generated`，連線使用 `@prisma/adapter-pg`。
- **TypeScript 5.9**。Prisma 7 的文件以此為準，沒有跟到 TypeScript 7。
- 付款介面放在 `@s4n/plugin-sdk`，API 重新導出使用方式。官方外掛因此不會依賴 API，也碰不到帳本。
- 密文欄位的標記是 JSON Schema 的 `x-s4n-secret: true`。加密的附加資料綁住外掛 id 與欄位名。
- 官方外掛是明確允許清單，不是 `official.` 前綴。
- TWD 的最小單位訂為 1 元，因為綠界與歐付寶收整數元。
- 儀表板的跨站請求防護是來源允許清單，加上未來的 `SameSite=Lax` cookie。這次沒有同步權杖，也沒有接上 Argon2 原生模組；參數寫在 `apps/api/src/auth/constants.ts`。
- 事件匯流排與限流都在單一程序的記憶體裡。
- 開發用主金鑰是 32 個零位元組。正式環境拒絕它。
- 儀表板元件使用 shadcn/ui，顏色改成紙色與硃砂，不是預設的灰。
- 視覺先做淺色。間距沿用 Tailwind 的 4px 刻度。

## English

This is a greenfield skeleton for S4N DONATE SYSTEM 2.0, not a finished donation product. The core owns the ledger, payment-provider interface, event bus, overlay shell, plugin secret vault, and permissions. ECPay and O'Pay are official payment plugins with real manifests and encrypted settings, and with no live provider API. `pnpm install` then `pnpm dev` starts the API, dashboard, OBS overlay, and docs. `docker compose up --build` starts PostgreSQL and the same apps. See the Traditional Chinese sections above for ports, layout, and the decisions this skeleton had to make.
