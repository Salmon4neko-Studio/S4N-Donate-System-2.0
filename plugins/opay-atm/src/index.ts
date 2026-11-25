import type { PaymentProvider } from "s4n-donate-system-2.0-plugin-sdk";
import { createAioProvider } from "s4n-donate-system-2.0-plugin-sdk/aio";
import { manifest } from "./manifest.js";

export { manifest };

const endpoints = {
  stage: {
    checkout: "https://payment-stage.opay.tw/Cashier/AioCheckOut/V5",
    query: "https://payment-stage.opay.tw/Cashier/QueryTradeInfo/V5",
  },
  production: {
    checkout: "https://payment.opay.tw/Cashier/AioCheckOut/V5",
    query: "https://payment.opay.tw/Cashier/QueryTradeInfo/V5",
  },
} as const;

/** Official worker entry. The core calls this. The plugin cannot see the ledger. */
export function createProvider(): PaymentProvider {
  return createAioProvider({ pluginId: manifest.id, endpoints, choosePayment: "ATM" });
}
