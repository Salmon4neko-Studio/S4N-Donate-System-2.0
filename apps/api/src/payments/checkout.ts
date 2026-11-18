import { PaymentConfigError, PaymentNotImplemented } from "@s4n/plugin-sdk";
import type { CoreBus } from "../realtime/bus.js";
import { decryptPluginSecrets } from "../plugins/secrets.js";
import type { SecretStore } from "../plugins/settings.js";
import type { LoadedPlugin, PaymentRegistry } from "../plugins/catalog.js";
import type { InstallationStore } from "../plugins/installations.js";
import type { Ledger } from "./ledger.js";
import { planDonation, validateDonationRequest, type DonationLimits } from "./plan.js";
import { paymentMethodReady } from "./readiness.js";
import { createTradeNo } from "./trade-no.js";

export interface CheckoutHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export async function createDonationCheckout(options: {
  body: unknown;
  catalog: readonly LoadedPlugin[];
  providers: PaymentRegistry;
  secrets: SecretStore;
  installations: InstallationStore;
  ledger: Ledger;
  bus: CoreBus;
  masterKey: Buffer;
  limits: DonationLimits;
  publicBaseUrl: string;
  dashboardOrigin: string;
}): Promise<CheckoutHttpResult> {
  const parsed = validateDonationRequest(options.body, options.limits);
  if (!parsed.ok) return { status: 422, body: { error: "invalid_donation", issues: parsed.issues } };

  const plugin = options.catalog.find((item) => item.manifest.id === parsed.value.pluginId);
  const provider = options.providers.get(parsed.value.pluginId);
  if (plugin === undefined || provider === undefined) {
    return { status: 404, body: { error: "unknown_provider" } };
  }

  let ready = false;
  try {
    ready = await paymentMethodReady(plugin, options.installations, options.secrets);
  } catch {
    return { status: 503, body: { error: "provider_unavailable" } };
  }
  if (!ready) return { status: 422, body: { error: "provider_unavailable" } };

  let secrets: Record<string, string> = {};
  let settings: Record<string, string | number | boolean> = {};
  try {
    [secrets, settings] = await Promise.all([
      decryptPluginSecrets(provider.pluginId, options.secrets, options.masterKey),
      options.secrets.readPublicSettings(provider.pluginId),
    ]);
  } catch {
    return { status: 503, body: { error: "secrets_unavailable" } };
  }

  const order = planDonation(createTradeNo(), parsed.value);
  order.expiresAt = provider.provisionalExpiry?.(new Date()) ?? null;
  try {
    await options.ledger.create(order);
  } catch {
    return { status: 503, body: { error: "ledger_unavailable" } };
  }

  const callbackUrl = `${options.publicBaseUrl}/api/payments/${provider.pluginId}/callback`;
  const returnUrl = `${options.publicBaseUrl}/api/payments/${provider.pluginId}/return`;
  const clientBackUrl = `${options.dashboardOrigin}/donate/cancelled?order=${order.id}`;
  const paymentInfoUrl = `${options.publicBaseUrl}/api/payments/${provider.pluginId}/payment-info`;
  const clientRedirectUrl = `${options.publicBaseUrl}/api/payments/${provider.pluginId}/payment-redirect`;

  try {
    const created = await provider.createPayment(
      {
        orderId: order.id,
        amountMinor: order.amountMinor,
        currency: order.currency,
        callbackUrl,
        returnUrl,
        clientBackUrl,
        paymentInfoUrl,
        clientRedirectUrl,
      },
      { secrets, settings },
    );
    try {
      await options.bus.publish("s4n.donation.created", {
        donationId: order.id,
        providerId: order.providerId,
        amountMinor: order.amountMinor,
        currency: order.currency,
        donorName: order.donorName,
        message: order.message,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // The checkout form is already built. A missing created-event is not an alert.
    }
    return {
      status: 201,
      body: {
        donationId: order.id,
        amountMinor: order.amountMinor,
        currency: order.currency,
        providerId: order.providerId,
        checkout: created.form,
      },
    };
  } catch (error) {
    try {
      await options.ledger.markFailed(order.id, null);
    } catch {
      return { status: 503, body: { error: "ledger_unavailable" } };
    }
    try {
      await options.bus.publish("s4n.donation.failed", {
        donationId: order.id,
        providerId: order.providerId,
        reason: "unknown",
      });
    } catch {
      // The order is already marked failed. The response below still reports the failure.
    }
    if (error instanceof PaymentNotImplemented) {
      return { status: 501, body: { error: "payment_not_implemented", pluginId: provider.pluginId } };
    }
    if (error instanceof PaymentConfigError) {
      return { status: 422, body: { error: "payment_config" } };
    }
    return { status: 500, body: { error: "donation_failed" } };
  }
}
