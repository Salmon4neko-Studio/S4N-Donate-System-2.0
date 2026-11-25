import type { PaymentProvider } from "s4n-donate-system-2.0-plugin-sdk";
import type { CoreBus } from "../realtime/bus.js";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { SecretStore } from "../plugins/settings.js";
import type { LoadedPlugin, PaymentRegistry } from "../plugins/catalog.js";
import { decideVerifiedPayment, type Ledger, type LedgerOrder } from "./ledger.js";
import { noticeFromForm } from "./notice.js";

export interface CallbackResult {
  status: number;
  contentType: "application/json" | "text/plain; charset=utf-8";
  body: string;
}

export interface Settlement {
  orderId: string | null;
  http: CallbackResult;
  /** True when this call changed the ledger to succeeded. */
  recordedPaid: boolean;
}

/**
 * Core-owned callback. The plugin may verify. Only this function writes the ledger,
 * and only after a positive verification. The booked amount is the stored order's amount.
 * A signed amount that differs from that order is rejected.
 */
export async function handlePaymentCallback(options: {
  pluginId: string;
  rawBody: string;
  headers: Readonly<Record<string, string>>;
  catalog: readonly LoadedPlugin[];
  providers: PaymentRegistry;
  secrets: SecretStore;
  ledger: Ledger;
  bus: CoreBus;
  masterKey: Buffer;
}): Promise<CallbackResult> {
  const settled = await settlePaymentNotification(options);
  return settled.http;
}

export async function settlePaymentNotification(options: {
  pluginId: string;
  rawBody: string;
  headers: Readonly<Record<string, string>>;
  catalog: readonly LoadedPlugin[];
  providers: PaymentRegistry;
  secrets: SecretStore;
  ledger: Ledger;
  bus: CoreBus;
  masterKey: Buffer;
}): Promise<Settlement> {
  const provider = options.providers.get(options.pluginId);
  if (provider === undefined) {
    const known = options.catalog.some((plugin) => plugin.manifest.id === options.pluginId);
    return known
      ? reject(null, 403, { error: "not_a_payment_provider" })
      : reject(null, 404, { error: "unknown_provider" });
  }

  let decrypted: Record<string, string> = {};
  let settings: Record<string, string | number | boolean> = {};
  let secretsFailed = false;
  try {
    [decrypted, settings] = await Promise.all([
      decryptPluginSecrets(options.pluginId, options.secrets, options.masterKey),
      options.secrets.readPublicSettings(options.pluginId),
    ]);
  } catch {
    secretsFailed = true;
  }

  const verification = await provider.verifyCallback(
    { headers: options.headers, rawBody: options.rawBody },
    { secrets: decrypted, settings },
  );

  if (!verification.ok && verification.reason === "not_implemented") {
    return {
      orderId: null,
      recordedPaid: false,
      http: json(501, { error: "not_implemented", pluginId: options.pluginId }),
    };
  }
  if (secretsFailed) return reject(null, 503, { error: "secrets_unavailable" }, provider);
  if (!verification.ok) {
    return reject(null, 400, { error: "verification_failed", reason: verification.reason }, provider);
  }

  let order;
  try {
    order = await options.ledger.getById(verification.orderId);
  } catch {
    return reject(verification.orderId, 503, { error: "ledger_unavailable" }, provider);
  }

  if (verification.outcome === "simulated") {
    if (order === null || order.id !== verification.orderId) {
      return reject(verification.orderId, 404, { error: "unknown_order" }, provider);
    }
    if (order.providerId !== options.pluginId) {
      return reject(verification.orderId, 409, { error: "provider_mismatch" }, provider);
    }
    if (order.amountMinor !== verification.amountMinor) {
      return reject(verification.orderId, 409, { error: "amount_mismatch" }, provider);
    }
    return accept(verification.orderId, { status: "ignored", donationId: verification.orderId }, provider);
  }

  const decision = decideVerifiedPayment(order, {
    orderId: verification.orderId,
    providerId: options.pluginId,
    providerRef: verification.providerRef,
    amountMinor: verification.amountMinor,
  });

  if (decision.action === "duplicate") {
    if (order !== null && order.status === "succeeded" && verification.outcome !== "failed") {
      const published = await publishSucceeded(options.bus, order, verification.providerRef);
      if (!published) return reject(order.id, 503, { error: "event_log_unavailable" }, provider);
    }
    return accept(verification.orderId, { status: "duplicate", donationId: verification.orderId }, provider);
  }
  if (decision.action === "missing_order") {
    return reject(verification.orderId, 404, { error: "unknown_order" }, provider);
  }
  if (decision.action === "amount_mismatch") {
    return reject(verification.orderId, 409, { error: "amount_mismatch" }, provider);
  }
  if (decision.action === "provider_mismatch") {
    return reject(verification.orderId, 409, { error: "provider_mismatch" }, provider);
  }
  if (decision.action === "already_failed") {
    if (verification.outcome === "failed") {
      return accept(verification.orderId, { status: "duplicate", donationId: verification.orderId }, provider);
    }
    return reject(verification.orderId, 409, { error: "already_failed" }, provider);
  }
  if (decision.action === "needs_review") {
    if (order === null || verification.outcome !== "paid") {
      return accept(verification.orderId, { status: "duplicate", donationId: verification.orderId }, provider);
    }
    try {
      const wrote = await options.ledger.markNeedsReview(order.id, {
        providerRef: verification.providerRef,
        notice: {
          ...noticeFromForm(options.rawBody),
          MerchantTradeNo: verification.orderId,
          TradeNo: verification.providerRef,
          TradeAmt: String(verification.amountMinor),
        },
      });
      if (wrote === "lost_race") {
        const again = await options.ledger.getById(order.id);
        if (again?.status === "review") {
          return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
        }
        return reject(order.id, 409, { error: "provider_mismatch" }, provider);
      }
    } catch {
      return reject(order.id, 503, { error: "ledger_unavailable" }, provider);
    }
    return accept(order.id, { status: "review", donationId: order.id }, provider);
  }

  if (order === null) {
    return reject(verification.orderId, 404, { error: "unknown_order" }, provider);
  }

  if (verification.outcome === "failed") {
    let wrote: "updated" | "lost_race";
    try {
      wrote = await options.ledger.markFailed(order.id, verification.providerRef || null);
    } catch {
      return reject(order.id, 503, { error: "ledger_unavailable" }, provider);
    }
    if (wrote === "lost_race") {
      return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
    }
    try {
      await options.bus.publish("s4n.donation.failed", {
        donationId: order.id,
        providerId: order.providerId,
        reason: "declined",
      });
    } catch {
      return reject(order.id, 503, { error: "event_log_unavailable" }, provider);
    }
    return accept(order.id, { status: "failed", donationId: order.id }, provider);
  }

  let wrote: "updated" | "lost_race";
  try {
    wrote = await options.ledger.markSucceeded(order.id, verification.providerRef);
  } catch {
    return reject(order.id, 503, { error: "ledger_unavailable" }, provider);
  }

  if (wrote === "lost_race") {
    const again = await options.ledger.getById(order.id);
    if (again?.status === "succeeded" && again.providerRef === verification.providerRef) {
      const published = await publishSucceeded(options.bus, again, verification.providerRef);
      if (!published) return reject(order.id, 503, { error: "event_log_unavailable" }, provider);
      return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
    }
    return reject(order.id, 409, { error: "provider_mismatch" }, provider);
  }

  const published = await publishSucceeded(options.bus, order, verification.providerRef);
  if (!published) return reject(order.id, 503, { error: "event_log_unavailable" }, provider);

  return {
    orderId: order.id,
    recordedPaid: true,
    http: accept(order.id, { status: "recorded", donationId: order.id }, provider).http,
  };
}

async function publishSucceeded(bus: CoreBus, order: LedgerOrder, providerRef: string): Promise<boolean> {
  const ref = order.providerRef ?? providerRef;
  if (ref.length === 0) return false;
  try {
    await bus.publish("s4n.donation.succeeded", {
      donationId: order.id,
      providerId: order.providerId,
      providerRef: ref,
      amountMinor: order.amountMinor,
      currency: order.currency,
      donorName: order.donorName,
      message: order.message,
    });
    return true;
  } catch {
    return false;
  }
}

function accept(
  orderId: string,
  jsonBody: Record<string, unknown>,
  provider?: PaymentProvider,
): Settlement {
  return { orderId, recordedPaid: false, http: reply(provider, "accepted", 200, jsonBody) };
}

function reject(
  orderId: string | null,
  status: number,
  jsonBody: Record<string, unknown>,
  provider?: PaymentProvider,
): Settlement {
  return { orderId, recordedPaid: false, http: reply(provider, "rejected", status, jsonBody) };
}

function reply(
  provider: PaymentProvider | undefined,
  kind: "accepted" | "rejected",
  status: number,
  jsonBody: Record<string, unknown>,
): CallbackResult {
  if (provider?.notifyBody) {
    return {
      status: kind === "accepted" ? 200 : status,
      contentType: "text/plain; charset=utf-8",
      body: kind === "accepted" ? provider.notifyBody.accepted : provider.notifyBody.rejected,
    };
  }
  return json(status, jsonBody);
}

function json(status: number, body: Record<string, unknown>): CallbackResult {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}
