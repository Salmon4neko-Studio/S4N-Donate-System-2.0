import type { CoreBus } from "../realtime/bus.js";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { SecretStore } from "../plugins/settings.js";
import type { PaymentRegistry } from "../plugins/catalog.js";
import type { Ledger } from "./ledger.js";
import { isTradeNo } from "./trade-no.js";

export async function reconcileDonation(options: {
  pluginId: string;
  orderId: string;
  providers: PaymentRegistry;
  secrets: SecretStore;
  ledger: Ledger;
  bus: CoreBus;
  masterKey: Buffer;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isTradeNo(options.orderId)) return { status: 404, body: { error: "unknown_order" } };
  const provider = options.providers.get(options.pluginId);
  if (provider === undefined) return { status: 404, body: { error: "unknown_provider" } };
  if (provider.queryTrade === undefined) return { status: 501, body: { error: "not_implemented" } };

  let order;
  try {
    order = await options.ledger.getById(options.orderId);
  } catch {
    return { status: 503, body: { error: "ledger_unavailable" } };
  }
  if (order === null || order.providerId !== options.pluginId) {
    return { status: 404, body: { error: "unknown_order" } };
  }

  let secrets: Record<string, string> = {};
  let settings: Record<string, string | number | boolean> = {};
  try {
    [secrets, settings] = await Promise.all([
      decryptPluginSecrets(options.pluginId, options.secrets, options.masterKey),
      options.secrets.readPublicSettings(options.pluginId),
    ]);
  } catch {
    return { status: 503, body: { error: "secrets_unavailable" } };
  }

  const queried = await provider.queryTrade({ orderId: options.orderId }, { secrets, settings });
  if (!queried.ok) {
    const status = queried.reason === "unavailable" ? 502 : 400;
    return { status, body: { error: "query_failed", reason: queried.reason } };
  }
  if (queried.orderId !== order.id || queried.amountMinor !== order.amountMinor) {
    return { status: 409, body: { error: "amount_mismatch" } };
  }

  if (queried.tradeStatus === "unpaid") {
    return { status: 200, body: { status: "pending", donationId: order.id } };
  }

  if (queried.tradeStatus === "failed") {
    if (order.status !== "created") {
      return { status: 200, body: { status: order.status, donationId: order.id } };
    }
    try {
      const wrote = await options.ledger.markFailed(order.id, queried.providerRef || null);
      if (wrote === "updated") {
        options.bus.publish("s4n.donation.failed", {
          donationId: order.id,
          providerId: order.providerId,
          reason: "declined",
        });
      }
    } catch {
      return { status: 503, body: { error: "ledger_unavailable" } };
    }
    return { status: 200, body: { status: "failed", donationId: order.id } };
  }

  if (order.status === "succeeded") {
    return { status: 200, body: { status: "duplicate", donationId: order.id } };
  }
  if (order.status === "failed") {
    return { status: 409, body: { error: "already_failed" } };
  }

  try {
    const wrote = await options.ledger.markSucceeded(order.id, queried.providerRef);
    if (wrote === "lost_race") {
      return { status: 200, body: { status: "duplicate", donationId: order.id } };
    }
  } catch {
    return { status: 503, body: { error: "ledger_unavailable" } };
  }

  options.bus.publish("s4n.donation.succeeded", {
    donationId: order.id,
    providerId: order.providerId,
    providerRef: queried.providerRef,
    amountMinor: order.amountMinor,
    currency: order.currency,
    donorName: order.donorName,
    message: order.message,
  });
  return { status: 200, body: { status: "recorded", donationId: order.id } };
}
