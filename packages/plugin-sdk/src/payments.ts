/**
 * Official payment plugins implement this. They never receive a ledger.
 * The signed amount is reported so the core can reject a mismatch.
 * The core still books the amount from the order it created.
 */
export interface CreatePaymentInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  /** Server notify URL (ECPay/O'Pay ReturnURL). */
  callbackUrl: string;
  /** Browser return URL (OrderResultURL). Not the ledger. */
  returnUrl: string;
  /** Browser back button (ClientBackURL). No payment result is posted here. */
  clientBackUrl: string;
}

export interface CheckoutForm {
  readonly action: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface CreatePaymentResult {
  readonly form: CheckoutForm;
}

export interface RawCallback {
  headers: Readonly<Record<string, string>>;
  rawBody: string;
}

export interface ProviderMaterial {
  readonly secrets: Readonly<Record<string, string>>;
  readonly settings: Readonly<Record<string, string | number | boolean>>;
}

export type CallbackVerification =
  | {
      readonly ok: true;
      readonly orderId: string;
      readonly providerRef: string;
      /** Amount inside the signed provider payload. */
      readonly amountMinor: number;
      readonly outcome: "paid" | "failed" | "simulated";
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_signature" | "malformed" | "not_implemented";
    };

export type QueryTradeResult =
  | {
      readonly ok: true;
      readonly orderId: string;
      readonly providerRef: string;
      readonly amountMinor: number;
      readonly tradeStatus: "paid" | "unpaid" | "failed";
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_signature" | "malformed" | "unavailable";
    };

export interface PaymentProvider {
  readonly pluginId: string;
  /**
   * When set, accepted notices use `accepted` as the raw body (ECPay/O'Pay `1|OK`).
   * Rejected notices use `rejected` and are not acknowledgements.
   */
  readonly notifyBody?: {
    readonly accepted: "1|OK";
    readonly rejected: "0|Error";
  };
  createPayment(input: CreatePaymentInput, material: ProviderMaterial): Promise<CreatePaymentResult>;
  verifyCallback(input: RawCallback, material: ProviderMaterial): Promise<CallbackVerification>;
  queryTrade?(input: { orderId: string }, material: ProviderMaterial): Promise<QueryTradeResult>;
}

export class PaymentNotImplemented extends Error {
  readonly code = "payment_not_implemented" as const;

  constructor(pluginId: string) {
    super(`${pluginId} payment provider is not implemented`);
    this.name = "PaymentNotImplemented";
  }
}

export class PaymentConfigError extends Error {
  readonly code = "payment_config" as const;

  constructor() {
    super("payment_config");
    this.name = "PaymentConfigError";
  }
}
