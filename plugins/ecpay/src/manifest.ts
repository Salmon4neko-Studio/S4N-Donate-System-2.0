import type { PluginManifest } from "@s4n/plugin-sdk";

export const manifest = {
  "id": "official.ecpay",
  "name": "綠界 ECPay",
  "version": "0.1.0",
  "api": "0.1",
  "description": "官方付款外掛骨架。設定契約是真的，尚未呼叫綠界 API。",
  "kind": [
    "payment"
  ],
  "permissions": [
    "payments.provider",
    "secrets",
    "network"
  ],
  "entry": {
    "worker": "./src/index.ts"
  },
  "settingsSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "merchantId",
      "hashKey",
      "hashIv",
      "environment"
    ],
    "properties": {
      "merchantId": {
        "type": "string",
        "title": "商店代號 MerchantID",
        "x-s4n-secret": true
      },
      "hashKey": {
        "type": "string",
        "title": "HashKey",
        "x-s4n-secret": true
      },
      "hashIv": {
        "type": "string",
        "title": "HashIV",
        "x-s4n-secret": true
      },
      "environment": {
        "type": "string",
        "title": "環境",
        "enum": [
          "stage",
          "production"
        ]
      }
    }
  }
} as const satisfies PluginManifest;
