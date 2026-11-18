import type { PaymentProvider } from "@s4n/plugin-sdk";
import type { CoreBus } from "../realtime/bus.js";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { SecretStore } from "../plugins/settings.js";
import type { LoadedPlugin, PaymentRegistry } from "../plugins/catalog.js";
import type { CallbackResult, Settlement } from "./callback.js";
import type { Ledger } from "./ledger.js";

/**
 * PaymentInfoURL. The number is issued here. The ledger moves to 待繳費.
 * This does not book a payment and does not alert.
 */
export async function settlePaymentInfo(options: {
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
    return reject(null, known ? 403 : 404, { error: known ? "not_a_payment_provider" : "unknown_provider" });
  }
  if (provider.verifyPaymentInfo === undefined) {
    return reject(null, 501, { error: "not_implemented", pluginId: options.pluginId }, provider);
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

  const verification = await provider.verifyPaymentInfo(
    { headers: options.headers, rawBody: options.rawBody },
    { secrets: decrypted, settings },
  );
  if (secretsFailed) return reject(null, 503, { error: "secrets_unavailable" }, provider);
  if (!verification.ok) {
    return reject(null, 400, { error: "verification_failed", reason: verification.reason }, provider);
  }

  const orderId = verification.outcome === "issued" ? verification.issued.orderId : verification.orderId;
  let order;
  try {
    order = await options.ledger.getById(orderId);
  } catch {
    return reject(orderId, 503, { error: "ledger_unavailable" }, provider);
  }
  if (order === null || order.id !== orderId) {
    return reject(orderId, 404, { error: "unknown_order" }, provider);
  }
  if (order.providerId !== options.pluginId) {
    return reject(orderId, 409, { error: "provider_mismatch" }, provider);
  }
  const amountMinor = verification.outcome === "issued" ? verification.issued.amountMinor : verification.amountMinor;
  if (order.amountMinor !== amountMinor) {
    return reject(orderId, 409, { error: "amount_mismatch" }, provider);
  }

  if (verification.outcome === "failed") {
    if (order.status === "failed" || order.status === "succeeded" || order.status === "expired") {
      return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
    }
    try {
      const wrote = await options.ledger.markFailed(order.id, verification.providerRef || null);
      if (wrote === "lost_race") return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
    } catch {
      return reject(order.id, 503, { error: "ledger_unavailable" }, provider);
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

  if (order.status === "succeeded" || order.status === "expired" || order.status === "failed") {
    return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
  }

  try {
    const wrote = await options.ledger.markAwaiting(order.id, {
      providerRef: verification.issued.providerRef,
      bankCode: verification.issued.bankCode,
      payCode: verification.issued.payCode,
      barcodes: verification.issued.barcodes,
      expiresAt: verification.issued.expiresAt,
      paymentType: verification.issued.paymentType,
    });
    if (wrote === "conflict") return reject(order.id, 409, { error: "instruction_conflict" }, provider);
    if (wrote === "lost_race") return accept(order.id, { status: "duplicate", donationId: order.id }, provider);
  } catch {
    return reject(order.id, 503, { error: "ledger_unavailable" }, provider);
  }
  return accept(order.id, { status: "awaiting", donationId: order.id }, provider);
}

function accept(orderId: string, jsonBody: Record<string, unknown>, provider?: PaymentProvider): Settlement {
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
  return { status, contentType: "application/json", body: JSON.stringify(jsonBody) };
}
