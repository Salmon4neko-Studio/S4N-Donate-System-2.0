---
title: 綠界與歐付寶
description: 信用卡、ATM、超商代碼與超商條碼的設定、回呼網址，以及測試站和正式站的差別。
---

每一種付款方式都是獨立的官方外掛。贊助頁只列出**已啟用**且**必填欄位都已設定**的那幾個。觀眾填顯示名稱、金額與留言之後，核心先建立訂單，瀏覽器再把表單送到廠商。HashKey 與 HashIV 不會進瀏覽器，也不會寫進紀錄。設定畫面只顯示「已設定」或「未設定」。

金額是整數新台幣。預設下限 30、上限 20000：

```bash
S4N_DONATION_MIN_TWD=30
S4N_DONATION_MAX_TWD=20000
```

## 要填的欄位

每個金流外掛的欄位都一樣。三個密文用 `S4N_MASTER_KEY` 做 AES-256-GCM，填在外掛頁，只顯示「已設定」或「未設定」。`environment` 不是密文，在側欄「外掛」裡該付款方式的設定頁（`/plugins/{id}/settings`）。外掛要先啟用，選單才會列出它。

| 欄位 | 說明 |
| --- | --- |
| MerchantID | 廠商後台的商店代號 |
| HashKey | 廠商後台的 HashKey |
| HashIV | 廠商後台的 HashIV |
| 環境 | `stage` 測試站，或 `production` 正式站 |

綠界與歐付寶要各填各的。信用卡、ATM、超商代碼、超商條碼也要各自啟用。同一家廠商的幾種方式可以用同一組商店代號，但每份外掛各自存一份密文。

## 公開網址

廠商的伺服器要打得到付款通知，觀眾的瀏覽器也要能回到站上。網址都從 `S4N_PUBLIC_BASE_URL` 組出來，不用這次請求進到的內網位址。

```bash
S4N_PUBLIC_BASE_URL=https://donate.example
```

把下面的 `{id}` 換成外掛 id，例如 `official.ecpay-atm`。

| 用途 | 路徑 | 誰來打 | 核心怎麼回 |
| --- | --- | --- | --- |
| ReturnURL | `/api/payments/{id}/callback` | 廠商伺服器，付款完成 | 驗過才入帳，成功回 `1|OK` |
| PaymentInfoURL | `/api/payments/{id}/payment-info` | 廠商伺服器，ATM／超商取號完成 | 訂單改成待繳費，回 `1|OK`。不入帳 |
| OrderResultURL | `/api/payments/{id}/return` | 觀眾瀏覽器，僅信用卡 | 驗過後導向謝謝頁。可以補記一筆已付款 |
| ClientRedirectURL | `/api/payments/{id}/payment-redirect` | 觀眾瀏覽器，取號完成 | 驗過後導向繳費資訊頁 |
| ClientBackURL | 儀表板的 `/donate/cancelled` | 觀眾按返回 | 不帶付款結果，訂單維持待付款 |

信用卡表單帶 ReturnURL、OrderResultURL、ClientBackURL。ATM、超商代碼、超商條碼改帶 ReturnURL、PaymentInfoURL、ClientRedirectURL，不帶 OrderResultURL。廠商文件寫明：非即時付款不支援 OrderResultURL；設了 ClientRedirectURL 之後，ClientBackURL 會失效。

`S4N_ENV=production` 時公開網址必填，而且只能是來源（不能帶路徑）。正式環境的 ReturnURL 要用 80 或 443。本機的 `127.0.0.1:8787` 只有你的瀏覽器打得到。沒有公開位址時，信用卡仍可靠瀏覽器被導回 OrderResultURL 入帳；ATM 與超商的取號通知要等網址公開，或在帳本按「向金流查詢」。

簽章不符、商店代號不符、金額不符，回 `0|Error`，訂單不改。同一筆成功通知再來一次，回 `1|OK`，不再送事件。

## 訂單狀態

| 畫面 | 帳本 | 意思 |
| --- | --- | --- |
| 待付款 | `created` | 訂單已建立，還沒有繳費資訊，也還沒付款 |
| 待繳費 | `awaiting` | ATM 帳號或超商代碼已經核發 |
| 已付款 | `succeeded` | 驗過的付款通知或查單結果。這時才送 `s4n.donation.succeeded` |
| 已過期 | `expired` | 期限過了，查單仍是未付款 |
| 待人工處理 | `review` | 過期之後才收到驗過的付款通知。沒有入帳，也沒有送提醒 |
| 失敗 | `failed` | 廠商明確拒絕。之後不會再改成已付款 |

信用卡沒有取號，待付款超過 24 小時且查單仍未付款，會標成已過期。ATM 預設 3 天，到期日的台北時間 23:59:59。超商代碼預設 10080 分鐘（7 天），這是繳款單的列印期限，列印後各超商的繳費期限以單據為準。超商條碼預設 7 天，到期日的 23:59:59。

到期前會先打 QueryTradeInfo。查到已付款就入帳並提醒。廠商沒回應就先留著，下一輪再查，避免金流中斷時把還能繳的帳號標成過期。

本地過期之後，若仍收到驗過的付款成功，訂單改成待人工處理，並留下不含檢查碼與金鑰的通知內容。這一筆不入帳，也不送 `s4n.donation.succeeded`。回應仍是 `1|OK`，讓廠商停止重送。金額不符仍然回 `0|Error`，訂單維持原狀。已經失敗的訂單不會被改成已付款。帳本沒有把待人工處理改回已付款的按鈕。

`s4n.donation.test` 只進事件紀錄，不建立訂單，也不進帳本。

## 綠界信用卡 `official.ecpay`

1. 到綠界加入會員，開通信用卡。
2. 廠商後台的系統介接設定取得 MerchantID、HashKey、HashIV。
3. 外掛頁啟用「綠界信用卡」，在同一頁儲存商店代號、HashKey、HashIV。側欄「外掛」裡的「綠界信用卡」再選測試站或正式站，儲存。

測試站（文件上的公開資料，沒有 3D 驗證）：

| 欄位 | 值 |
| --- | --- |
| 環境 | 測試站 |
| MerchantID | `2000132` |
| HashKey | `5294y06JbISpM5x9` |
| HashIV | `v77hoKGq4kWxNNIS` |
| 開單 | `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` |
| 查單 | `https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5` |

信用卡測試卡號 `4311-9522-2222-2222`，安全碼 `222`，有效月年要晚於今天。另一組 `4311-9511-1111-1111` 的安全碼可任意三碼。需要 3D 驗證時改用特店 `3002607`（HashKey `pwFHCqoQZGmho4w6`、HashIV `EkRm7iFT261dpevs`），簡訊驗證碼固定 `1234`。以上都來自綠界開發者文件，不是正式商店的金鑰。

正式站開單網址是 `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`。

## 綠界 ATM `official.ecpay-atm`

啟用「綠界 ATM」，填同一組或另一組商店代號。表單的 `ChoosePayment` 是 `ATM`，`ExpireDate` 是 `3`（天）。

取號通知的 `RtnCode` 為 `2` 才算成功，並帶銀行代碼 `BankCode` 與虛擬帳號 `vAccount`。觀眾會看到繳費資訊頁：銀行代碼、帳號、金額、期限，以及複製按鈕。付款完成的 ReturnURL 仍是 `RtnCode=1`，這時才入帳並送提醒。

廠商後台若要填回呼，PaymentInfoURL 與 ReturnURL 都要指到上面的路徑。沒有公開網址時，測試站的畫面仍會顯示帳號，但本機收不到取號通知。

## 綠界超商代碼 `official.ecpay-cvs`

啟用「綠界超商代碼」。`ChoosePayment` 是 `CVS`，`StoreExpireDate` 是 `10080`（分鐘）。

取號成功的 `RtnCode` 是 `10100073`，繳費代碼在 `PaymentNo`。繳費資訊頁給觀眾這組代碼、金額和期限。

## 綠界超商條碼 `official.ecpay-barcode`

啟用「綠界超商條碼」。`ChoosePayment` 是 `BARCODE`，`StoreExpireDate` 是 `7`（天）。

取號成功同樣是 `RtnCode` `10100073`。廠商只回三段號碼 `Barcode1`、`Barcode2`、`Barcode3`，不回條碼圖。繳費資訊頁把三段號碼分開，並可複製。請告訴觀眾不要重複繳費。

## 歐付寶

步驟與綠界相同，外掛 id 是：

| 方式 | id |
| --- | --- |
| 信用卡 | `official.opay` |
| ATM | `official.opay-atm` |
| 超商代碼 | `official.opay-cvs` |
| 超商條碼 | 先不提供。程式留在 `plugins/opay-barcode`，沒有放進官方索引，贊助頁不會出現 |

歐付寶公開的測試商店與綠界那組無 3D 的測試商店相同：MerchantID `2000132`、HashKey `5294y06JbISpM5x9`、HashIV `v77hoKGq4kWxNNIS`。測試卡同樣是 `4311-9522-2222-2222` / 安全碼 `222`。

| 環境 | 開單 | 查單 |
| --- | --- | --- |
| 測試站 | `https://payment-stage.opay.tw/Cashier/AioCheckOut/V5` | `https://payment-stage.opay.tw/Cashier/QueryTradeInfo/V5` |
| 正式站 | `https://payment.opay.tw/Cashier/AioCheckOut/V5` | `https://payment.opay.tw/Cashier/QueryTradeInfo/V5` |

歐付寶超商代碼的 `StoreExpireDate` 在大於 100 時以分鐘計，所以同樣送 `10080`。ATM 的 `ExpireDate` 是天數 `3`。取號與付款的 `RtnCode` 規則與綠界相同。

歐付寶超商條碼先關掉。公開的付款方式表以信用卡、ATM、超商代碼為主，所以 `official.opay-barcode` 不在簽名索引裡，也不能安裝，贊助頁不會列出它。綠界超商條碼仍然可用。

## 檢查碼

EncryptType 固定為 `1`（SHA-256）。產生與驗證都照廠商附錄：

1. 參數名稱不區分大小寫排序，串成 `key=value`，以 `&` 連接。`CheckMacValue` 自己不參與。
2. 前後加上 `HashKey` 與 `HashIV`。
3. 整段做與 .NET / PHP `urlencode` 相同的編碼後轉小寫。空白變成 `+`，`~` 變成 `%7e`，`'` 變成 `%27`，`- _ . ! * ( )` 還原成原字元。
4. SHA-256，再轉大寫十六進位。

比對是固定長度的常數時間比較。長度不對就不會通過。商店代號也用雜湊後的常數時間比較。

測試站的模擬付款（`SimulatePaid=1`）可以入帳，方便沒有卡號時試通知。正式站收到模擬付款只回 `1|OK`，不入帳。
