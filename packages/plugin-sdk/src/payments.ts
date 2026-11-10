/**
 * Official payment plugins implement this. They never receive a ledger.
 * Verification has no amount: the core keeps the amount from the order it created.
 */
export interface CreatePaymentInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  callbackUrl: string;
  returnUrl: string;
}

export interface CreatePaymentResult {
  redirectUrl: string;
}

export interface RawCallback {
  headers: Readonly<Record<string, string>>;
  rawBody: string;
}

export type CallbackVerification =
  | {
      readonly ok: true;
      readonly orderId: string;
      readonly providerRef: string;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_signature" | "malformed" | "not_implemented";
    };

export interface PaymentProvider {
  readonly pluginId: string;
  createPayment(
    input: CreatePaymentInput,
    secrets: Readonly<Record<string, string>>,
  ): Promise<CreatePaymentResult>;
  verifyCallback(
    input: RawCallback,
    secrets: Readonly<Record<string, string>>,
  ): Promise<CallbackVerification>;
}

export class PaymentNotImplemented extends Error {
  readonly code = "payment_not_implemented" as const;

  constructor(pluginId: string) {
    super(`${pluginId} payment provider is not implemented`);
    this.name = "PaymentNotImplemented";
  }
}
