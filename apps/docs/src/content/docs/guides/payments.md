---
title: 綠界與歐付寶
description: 取得商店代號、用公開沙盒測試信用卡贊助，以及設定回呼網址。
---

贊助頁只列出**已啟用**且**必填欄位都已設定**的付款外掛。觀眾填顯示名稱、金額與留言，核心先建立待付款訂單，瀏覽器再把表單送到廠商的信用卡頁。HashKey 與 HashIV 不會進瀏覽器，也不會寫進紀錄。

這次只接信用卡一次付清。ATM、超商代碼要等取號之後才算付款，還沒有做。

金額是整數新台幣。預設下限 30、上限 20000，用環境變數改：

```bash
S4N_DONATION_MIN_TWD=30
S4N_DONATION_MAX_TWD=20000
```

## 公開網址

綠界與歐付寶的伺服器要打得到付款通知，觀眾的瀏覽器也要能回到站上。這兩個網址都從 `S4N_PUBLIC_BASE_URL` 組出來，不要用請求進到的內網位址。

```bash
S4N_PUBLIC_BASE_URL=https://donate.example
```

| 用途 | 路徑 |
| --- | --- |
| 伺服器付款通知 ReturnURL | `/api/payments/official.ecpay/callback` 或 `official.opay` |
| 瀏覽器付款結果 OrderResultURL | `/api/payments/official.ecpay/return` |
| 觀眾按返回 ClientBackURL | 儀表板來源的 `/donate/cancelled` |

`S4N_ENV=production` 時這個變數必填，而且只能是網址來源（不能帶路徑）。開發環境沒設的話，預設是 `http://127.0.0.1:8787`。

廠商文件寫明：正式環境的 ReturnURL 要用 80 或 443，不要自訂埠。本機的 `127.0.0.1:8787` 只有你自己的瀏覽器打得到，綠界的伺服器打不進來。沒有公開位址時，信用卡付完仍可靠瀏覽器被導回 `OrderResultURL` 入帳；伺服器通知要等網址公開，或在帳本對待付款的那筆按「向金流查詢」。

## 綠界

1. 到綠界加入會員，開通信用卡。
2. 廠商後台的系統介接設定可以取得 MerchantID、HashKey、HashIV。
3. 外掛庫啟用「綠界 ECPay」，環境選正式站或測試站，儲存。三個金鑰欄位之後只會顯示已設定或尚未設定。

測試站（文件上的公開資料，沒有 3D 驗證）：

| 欄位 | 值 |
| --- | --- |
| 環境 | 測試站 |
| MerchantID | `2000132` |
| HashKey | `5294y06JbISpM5x9` |
| HashIV | `v77hoKGq4kWxNNIS` |
| 開單網址 | `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` |

信用卡測試卡號 `4311-9522-2222-2222`，安全碼 `222`，有效月年要晚於今天。另一組 `4311-9511-1111-1111` 的安全碼可任意三碼。需要 3D 驗證時改用特店 `3002607`（HashKey `pwFHCqoQZGmho4w6`、HashIV `EkRm7iFT261dpevs`），簡訊驗證碼固定 `1234`。以上都來自綠界開發者文件的測試介接資訊，不是正式商店的金鑰。

## 歐付寶

步驟與綠界相同：會員後台取得金鑰，外掛庫啟用「歐付寶 O'Pay」，選環境後儲存。

歐付寶公開的測試商店與綠界那組無 3D 的測試商店相同：MerchantID `2000132`、HashKey `5294y06JbISpM5x9`、HashIV `v77hoKGq4kWxNNIS`。測試卡同樣是 `4311-9522-2222-2222` / 安全碼 `222`。開單網址是 `https://payment-stage.opay.tw/Cashier/AioCheckOut/V5`。

## 付款之後

伺服器通知的檢查碼相符、商店代號相符、金額等於當初的訂單，才會把訂單標成已付款，並送出**一次** `s4n.donation.succeeded`。重複通知回 `1|OK`，不再送事件。金額不符、商店代號不符或簽章不符回 `0|Error`，訂單維持原狀。

交易失敗（`RtnCode` 不是 1）會標成未成功，並送出一次 `s4n.donation.failed`。已經未成功的訂單，之後就算收到付款成功也不會改成已付款。

測試站會把廠商後台的模擬付款（`SimulatePaid=1`）當成付款成功，方便沒有卡號時試通知。正式站收到模擬付款只回 `1|OK`，不入帳。

觀眾付完會看到謝謝或未完成。按返回商店則是取消頁，訂單仍是待付款。
