---
title: 安全性
description: 主金鑰、密文設定、營運者工作階段、疊層權杖與回呼記帳。
---

## 主金鑰與密文

伺服器環境只放一把 `S4N_MASTER_KEY`。它必須是標準 Base64，解出來剛好 32 位元組。外掛的 MerchantID、HashKey、HashIV 在寫入時以 AES-256-GCM 密封，附加驗證資料是 `s4n.plugin-setting:<pluginId>:<fieldKey>`，所以同一段密文不能挪到別的欄位。

儀表板與 `GET /api/plugins/:id/settings` 只回「這個欄位是密文、是否已設定」。那個回應不會帶明文，也不會帶密文本身。解密只發生在核心記憶體裡，用來簽名或驗證。

全零的開發金鑰在 `S4N_ENV=production` 會拒絕啟動。

## 付款回呼

路由是 `POST /api/payments/:pluginId/callback`。瀏覽器導回是另一條 `POST /api/payments/:pluginId/return`，驗證通過後改導向贊助結果頁，不把金流的原始參數留給前端。

1. 核心找出已註冊的付款外掛。社群外掛或不在清單裡的 id 不會進到記帳。
2. 核心解密該外掛的密鑰，連同不含密文的環境設定交給外掛。
3. 外掛用常數時間比對 CheckMacValue，並核對 MerchantID 與付款方式。簽章或商店代號不符就拒絕。
4. 外掛回傳訂單編號、供應商參考號，以及簽章裡的金額。
5. 核心只在金額等於當初建立的訂單、而且廠商交易編號與取號時記下的相同（若已有）時入帳。帳本與 `s4n.donation.succeeded` 用的是訂單金額。金額不符不會入帳。
6. 同一筆成功通知再來一次，回傳廠商要的 `1|OK`，且不再發事件。
7. 簽章通過但交易失敗，訂單改成失敗，只發一次 `s4n.donation.failed`。失敗之後不會再被改成已付款。
8. PaymentInfoURL 只把訂單改成待繳費，並存銀行代碼、帳號或超商代碼。它不入帳、不送提醒。重複的同一組繳費資訊回 `1|OK`。另一組帳號不會蓋掉已存的那組。
9. 到期前先查單。查單失敗或逾時不會把訂單標成過期。還沒過期、查到已付款，才入帳。
10. 訂單已經是已過期，之後才收到驗過的付款成功：改成待人工處理，留下不含 CheckMacValue 與金鑰的通知，回 `1|OK`。不入帳，不送 `s4n.donation.succeeded`。再來一次同樣回 `1|OK`，不覆蓋第一份通知。

綠界與歐付寶收到可接受的通知時，回應本文正好是 `1|OK`。拒絕時是 `0|Error`。HashKey、HashIV 不進紀錄、不進回應。MerchantID 會出現在送去廠商的結帳表單裡，因為他們的規格把商店代號當表單欄位；設定 API 仍然不回這個值。

回呼網址用 `S4N_PUBLIC_BASE_URL` 組，不用這次請求的 Host，避免反向代理後面簽出內網位址。正式環境沒有這個變數會拒絕啟動。

贊助頁只會列出已啟用且必填設定都齊的付款方式。訂單先寫進帳本，金額以伺服器算的為準。顯示名稱最多 40 字、留言最多 200 字，控制字元會被拒絕。

贊助人名稱、留言與聊天文字在型別上是 `UntrustedText`。贊助提醒把控制字元拿掉之後，以文字節點顯示，不把內容當成 HTML。語音仍然沒有合成。

## 權限

第一階段只有核心允許清單上的官方外掛能使用 `payments.provider`、`secrets`、`network`。清單是明確的 id，不是看到 `official.` 前綴就放行。`events.emit` 也不能發送 `s4n.donation.created`、`succeeded`、`failed` 或 `s4n.donation.test`。

社群外掛的預設是 `events.subscribe`、`overlay.slot`、`dashboard.settings`。

## 外掛市集的簽章

官方索引用 Ed25519 簽名，公鑰釘在 `apps/api/src/plugins/marketplace/pinned-key.ts`。私鑰不在版本庫。沒有簽章、內容被改、或鑰匙不對的索引都不會被採用。

每份外掛還有 SHA-256，對的是 `s4n-plugin.json` 的正規化內容。摘要和檔案不一致就不會安裝或更新。

金流外掛只允許官方索引裡點名的方式：綠界與歐付寶的信用卡、ATM、超商代碼，以及綠界超商條碼。歐付寶超商條碼先不放進索引。社群外掛要能記下安裝，權限必須全在疊層與儀表板那一組，而且這個版本仍不執行它的程式。

加入這些付款方式時，索引是用建置環境裡臨時產生的 Ed25519 鑰匙簽的。私鑰沒有進入版本庫，也沒有留下備份。正式環境請自行產生鑰匙，在同一個提交裡換掉 `pinned-key.ts` 與 `official.json`。不要把這次的公鑰當成正式信任根。

安裝、更新、移除與權限變更會寫進 `s4n.plugin.changed`。內容只有 id、版本與權限名稱。設定值與密文不會進事件紀錄，這類事件也不會送到 OBS。細節見 [外掛市集](/guides/marketplace/)。

## 營運者認證

儀表板 API 需要工作階段。贊助頁建立贊助、付款回呼與健康檢查不需要。

- Cookie 名稱 `s4n_session`，`httpOnly`、`SameSite=Lax`。只有 `S4N_ENV=production` 會加 `Secure`，否則本機 HTTP 存不住
- 值是伺服器 `Session` 列的編號，不是瀏覽器可以自行延展的權杖
- 密碼是 Argon2id，參數在 `apps/api/src/auth/constants.ts`。雜湊由 `hash-wasm` 計算，沒有額外的原生模組
- 工作階段約 12 小時到期。超過 15 分鐘會換成新編號，到期時間不延長
- 登入有固定窗口限流。錯誤的密碼與不存在的帳號回同一種錯誤
- 初次設定在已經有營運者時會拒絕
- 會改變狀態的儀表板請求要通過來源允許清單。本機會同時接受 `localhost` 與 `127.0.0.1`
- 付款回呼不是瀏覽器請求，不看 Origin，改由外掛驗簽
- 回呼、設定與登入的限流都在單一程序的記憶體裡

## 疊層權杖

OBS 不帶登入 Cookie。疊層網址帶一組每個營運者一枚的權杖。伺服器存 SHA-256 作查找，並用主金鑰把權杖密封，這樣已登入的儀表板還可以顯示網址。重新產生會換掉這兩份資料，舊權杖立即失效。

這組網址等於通行憑證。不要提交到版本庫，也不要貼到會記錄網址的公開服務。

贊助提醒與聊天疊層共用這一組權杖，也共用這一條網址。網址上不再用 `plugin` 選擇畫面。舊網址若還帶著 `plugin`，會打開同一張畫布。Twitch 的 Client ID 與 Client Secret 若有填，跟綠界金鑰一樣密封在 `EncryptedPluginSetting`，附加驗證資料仍是 `s4n.plugin-setting:<pluginId>:<fieldKey>`。儀表板只看得到「已設定」或「未設定」。解密只發生在 API 程序裡，用來向 Twitch 換應用程式權杖並抓徽章；那個應用程式權杖不會寫進 OBS 網址、事件、設定 API，或疊層的 `/api/overlay/scene` 回應。

`/api/overlay/scene` 只認網址上的權杖，不看登入 Cookie。它回傳畫布尺寸，以及已啟用且宣告了版位的外掛名稱與比例，沒有外掛設定，也沒有密文。

沒有填 Client ID 時，聊天仍可用匿名 `justinfan` 讀取。送去 `irc-ws.chat.twitch.tv` 的 `PASS` 是 Twitch 公開的匿名密碼 `SCHMOOPIIE`，不是營運者的 OAuth 權杖，也不是 Client Secret。表情圖網址只接受 `https://static-cdn.jtvnw.net/`。聊天文字在疊層以文字節點繪製。

## 事件紀錄

`EventLog` 跟 `Donation` 是兩張表。測試贊助只進事件紀錄。寫入前會拒絕名稱像 `hashKey`、`clientSecret`、`password`、`token` 這類的欄位，錯誤訊息只指出欄位名稱，不帶值。

疊層仍用雜湊過的疊層權杖，不改用工作階段 Cookie。工作台的即時連線才使用 `s4n_session`。送給瀏覽器的是事件本身或一行摘要，不是外掛密文。

同一筆贊助的同一種事件只保留一列。金流重複通知時，疊層不會因為第二列再響一次。細節與多程序的 `LISTEN`/`NOTIFY` 見 [事件紀錄](/guides/events/)。

還沒有內容安全政策。登入限流與 Twitch 徽章快取仍在單一程序的記憶體裡。工作階段與事件紀錄在資料庫裡，多個 API 程序看得到同一條紀錄。
