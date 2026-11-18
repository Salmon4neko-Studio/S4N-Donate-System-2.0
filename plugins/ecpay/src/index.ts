import type { PaymentProvider } from "@s4n/plugin-sdk";
import { createAioProvider } from "@s4n/plugin-sdk/aio";
import { manifest } from "./manifest.js";

export { manifest };

const endpoints = {
  stage: {
    checkout: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    query: "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
  },
  production: {
    checkout: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
    query: "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
  },
} as const;

/** Official worker entry. The core calls this. The plugin cannot see the ledger. */
export function createProvider(): PaymentProvider {
  return createAioProvider({ pluginId: manifest.id, endpoints, choosePayment: "Credit" });
}
