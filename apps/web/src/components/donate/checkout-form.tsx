import { useEffect, useRef } from "react";
import { buttonClass, Note } from "@/components/fields";
import { isPaymentAction, providerLabel, type CheckoutDraft } from "@/lib/payment";
import { formatTwd } from "@/lib/money";

const submitted = new Set<string>();

export function CheckoutForm({ draft }: { draft: CheckoutDraft }) {
  const formRef = useRef<HTMLFormElement>(null);
  const allowed = isPaymentAction(draft.action);
  const provider = providerLabel[draft.providerId] ?? "付款頁";

  useEffect(() => {
    if (!allowed || submitted.has(draft.donationId)) return;
    submitted.add(draft.donationId);
    formRef.current?.requestSubmit();
  }, [allowed, draft.donationId]);

  if (!allowed) {
    return <Note tone="danger">付款網址不在綠界或歐付寶，已停止送出。</Note>;
  }

  return (
    <form ref={formRef} method="post" action={draft.action} acceptCharset="UTF-8" className="s4n-fields">
      {Object.entries(draft.fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <p className="ts-text is-description">
        {formatTwd(draft.amountMinor)}，接下來前往{provider}。金額來自伺服器上的訂單。
      </p>
      <button type="submit" className={buttonClass({ tone: "accent", size: "large", fluid: true, icon: "start" })}>
        <span className="ts-icon is-credit-card-icon" aria-hidden="true" />
        前往付款
      </button>
      <p className="ts-text is-description">如果沒有自動前往，請按按鈕。</p>
    </form>
  );
}
