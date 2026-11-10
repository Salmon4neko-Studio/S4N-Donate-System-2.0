import { PaymentNotImplemented, type PaymentProvider } from "@s4n/plugin-sdk";
import { manifest } from "./manifest.js";

export { manifest };

/** Official worker entry. The core calls this. The plugin cannot see the ledger. */
export function createProvider(): PaymentProvider {
  return {
    pluginId: manifest.id,
    async createPayment() {
      throw new PaymentNotImplemented(manifest.id);
    },
    async verifyCallback() {
      return { ok: false, reason: "not_implemented" };
    },
  };
}
