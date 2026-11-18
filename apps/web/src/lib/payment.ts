export const PAYMENT_HOSTS = new Set([
  "payment-stage.ecpay.com.tw",
  "payment.ecpay.com.tw",
  "payment-stage.opay.tw",
  "payment.opay.tw",
]);

export const providerLabel: Record<string, string> = {
  "official.ecpay": "綠界信用卡",
  "official.ecpay-atm": "綠界 ATM",
  "official.ecpay-cvs": "綠界超商代碼",
  "official.ecpay-barcode": "綠界超商條碼",
  "official.opay": "歐付寶信用卡",
  "official.opay-atm": "歐付寶 ATM",
  "official.opay-cvs": "歐付寶超商代碼",
  "official.opay-barcode": "歐付寶超商條碼",
};


const CHECKOUT_KEY = "s4n.checkout";

export interface CheckoutDraft {
  donationId: string;
  amountMinor: number;
  currency: string;
  providerId: string;
  action: string;
  fields: Record<string, string>;
}

export function isPaymentAction(action: string): boolean {
  try {
    const url = new URL(action);
    return url.protocol === "https:" && PAYMENT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function saveCheckout(draft: CheckoutDraft): void {
  sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
}

export function readCheckout(): CheckoutDraft | null {
  const raw = sessionStorage.getItem(CHECKOUT_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<CheckoutDraft>;
    if (typeof value.donationId !== "string" || typeof value.action !== "string") return null;
    if (typeof value.providerId !== "string" || typeof value.amountMinor !== "number") return null;
    if (typeof value.currency !== "string" || value.fields === undefined || typeof value.fields !== "object") return null;
    const fields: Record<string, string> = {};
    for (const [key, field] of Object.entries(value.fields)) {
      if (typeof field === "string") fields[key] = field;
    }
    return {
      donationId: value.donationId,
      amountMinor: value.amountMinor,
      currency: value.currency,
      providerId: value.providerId,
      action: value.action,
      fields,
    };
  } catch {
    return null;
  }
}
