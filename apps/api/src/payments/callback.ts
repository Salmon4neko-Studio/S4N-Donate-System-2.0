import type { CoreBus } from "../realtime/bus.js";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { SecretStore } from "../plugins/settings.js";
import type { LoadedPlugin, PaymentRegistry } from "../plugins/catalog.js";
import { decideVerifiedPayment, type Ledger } from "./ledger.js";

export interface CallbackResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Core-owned callback. The plugin may verify. Only this function writes the ledger,
 * and only after a positive verification. The amount is the stored order's amount.
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
  const provider = options.providers.get(options.pluginId);
  if (provider === undefined) {
    const known = options.catalog.some((plugin) => plugin.manifest.id === options.pluginId);
    return known
      ? { status: 403, body: { error: "not_a_payment_provider" } }
      : { status: 404, body: { error: "unknown_provider" } };
  }

  let decrypted: Record<string, string> = {};
  let secretsFailed = false;
  try {
    decrypted = await decryptPluginSecrets(options.pluginId, options.secrets, options.masterKey);
  } catch {
    secretsFailed = true;
  }

  const verification = await provider.verifyCallback(
    { headers: options.headers, rawBody: options.rawBody },
    decrypted,
  );

  if (!verification.ok && verification.reason === "not_implemented") {
    return { status: 501, body: { error: "not_implemented", pluginId: options.pluginId } };
  }
  if (secretsFailed) {
    return { status: 503, body: { error: "secrets_unavailable" } };
  }
  if (!verification.ok) {
    return { status: 400, body: { error: "verification_failed", reason: verification.reason } };
  }

  let order;
  try {
    order = await options.ledger.getById(verification.orderId);
  } catch {
    return { status: 503, body: { error: "ledger_unavailable" } };
  }

  const decision = decideVerifiedPayment(order, {
    orderId: verification.orderId,
    providerId: options.pluginId,
    providerRef: verification.providerRef,
  });

  if (decision.action === "duplicate") {
    return { status: 200, body: { status: "duplicate", donationId: verification.orderId } };
  }
  if (decision.action === "missing_order") {
    return { status: 404, body: { error: "unknown_order" } };
  }
  if (decision.action === "provider_mismatch" || decision.action === "already_failed") {
    return { status: 409, body: { error: decision.action } };
  }

  if (order === null) {
    return { status: 404, body: { error: "unknown_order" } };
  }

  let wrote: "updated" | "lost_race";
  try {
    wrote = await options.ledger.markSucceeded(order.id, verification.providerRef);
  } catch {
    return { status: 503, body: { error: "ledger_unavailable" } };
  }

  if (wrote === "lost_race") {
    const again = await options.ledger.getById(order.id);
    if (again?.status === "succeeded" && again.providerRef === verification.providerRef) {
      return { status: 200, body: { status: "duplicate", donationId: order.id } };
    }
    return { status: 409, body: { error: "provider_mismatch" } };
  }

  options.bus.publish("s4n.donation.succeeded", {
    donationId: order.id,
    providerId: order.providerId,
    providerRef: verification.providerRef,
    amountMinor: order.amountMinor,
    currency: order.currency,
    donorName: order.donorName,
    message: order.message,
  });

  return { status: 200, body: { status: "recorded", donationId: order.id } };
}
