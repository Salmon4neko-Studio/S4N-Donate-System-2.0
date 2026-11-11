import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
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
    return (
      <p className="text-sm leading-6 text-cinnabar" role="status">
        付款網址不在綠界或歐付寶，已停止送出。
      </p>
    );
  }

  return (
    <form ref={formRef} method="post" action={draft.action} acceptCharset="UTF-8" className="mt-8 flex flex-col gap-4">
      {Object.entries(draft.fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <p className="text-sm leading-6 text-ink-soft">
        {formatTwd(draft.amountMinor)}，接下來前往{provider}的信用卡付款頁。金額來自伺服器上的訂單。
      </p>
      <Button type="submit" className="h-11 px-5">
        前往付款
      </Button>
      <p className="text-sm text-ink-soft">如果沒有自動前往，請按按鈕。</p>
    </form>
  );
}
