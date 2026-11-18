import type { CoreBus } from "../realtime/bus.js";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { SecretStore } from "../plugins/settings.js";
import type { PaymentRegistry } from "../plugins/catalog.js";
import type { Ledger, LedgerOrder } from "./ledger.js";

/**
 * QueryTradeInfo for unpaid orders whose deadline has passed.
 * A paid query books the order. An unpaid or missing query expires it.
 * A provider outage leaves the order alone so a later notify can still land.
 */
export async function expireDueOrders(options: {
  now: Date;
  ledger: Ledger;
  providers: PaymentRegistry;
  secrets: SecretStore;
  bus: CoreBus;
  masterKey: Buffer;
  limit?: number;
}): Promise<{ checked: number; expired: number; recorded: number }> {
  const due = await options.ledger.listDue(options.now, options.limit ?? 20);
  let expired = 0;
  let recorded = 0;
  for (const order of due) {
    const outcome = await reconcileOne(order, options);
    if (outcome === "expired") expired += 1;
    if (outcome === "recorded") recorded += 1;
  }
  return { checked: due.length, expired, recorded };
}

async function reconcileOne(
  order: LedgerOrder,
  options: {
    providers: PaymentRegistry;
    secrets: SecretStore;
    ledger: Ledger;
    bus: CoreBus;
    masterKey: Buffer;
  },
): Promise<"expired" | "recorded" | "skipped"> {
  const provider = options.providers.get(order.providerId);
  if (provider?.queryTrade === undefined) return "skipped";

  let secrets: Record<string, string> = {};
  let settings: Record<string, string | number | boolean> = {};
  try {
    [secrets, settings] = await Promise.all([
      decryptPluginSecrets(order.providerId, options.secrets, options.masterKey),
      options.secrets.readPublicSettings(order.providerId),
    ]);
  } catch {
    return "skipped";
  }

  const queried = await provider.queryTrade({ orderId: order.id }, { secrets, settings });
  if (!queried.ok) return "skipped";
  if (queried.orderId !== order.id) return "skipped";
  if (queried.tradeStatus !== "failed" && queried.amountMinor !== order.amountMinor) return "skipped";

  if (queried.tradeStatus === "paid") {
    let wrote: "updated" | "lost_race";
    try {
      wrote = await options.ledger.markSucceeded(order.id, queried.providerRef);
    } catch {
      return "skipped";
    }
    if (wrote === "lost_race") return "skipped";
    try {
      await options.bus.publish("s4n.donation.succeeded", {
        donationId: order.id,
        providerId: order.providerId,
        providerRef: queried.providerRef,
        amountMinor: order.amountMinor,
        currency: order.currency,
        donorName: order.donorName,
        message: order.message,
      });
    } catch {
      return "skipped";
    }
    return "recorded";
  }

  try {
    const wrote = await options.ledger.markExpired(order.id);
    return wrote === "updated" ? "expired" : "skipped";
  } catch {
    return "skipped";
  }
}

export function startPaymentExpiry(run: () => Promise<void>, intervalMs: number): () => void {
  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
