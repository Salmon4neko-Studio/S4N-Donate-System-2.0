import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { buttonClass } from "@/components/fields";
import { PublicPage } from "@/components/public-page";
import { ResultPanel } from "@/components/donate/result-panel";
import { api } from "@/lib/api";
import { formatTwd } from "@/lib/money";
import { providerLabel } from "@/lib/payment";
import { formatTaipei } from "@/lib/time";

interface Instructions {
  status: "created" | "awaiting" | "succeeded" | "expired" | "failed";
  amountMinor: number;
  currency: string;
  providerId: string;
  expiresAt: string | null;
  bankCode: string | null;
  payCode: string | null;
  barcodes: readonly [string, string, string] | null;
}

type View =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; instructions: Instructions };

export function DonatePayPage() {
  const [params] = useSearchParams();
  const order = params.get("order") ?? "";
  const [view, setView] = useState<View>(/^[a-f0-9]{20}$/.test(order) ? { kind: "loading" } : { kind: "missing" });

  useEffect(() => {
    if (!/^[a-f0-9]{20}$/.test(order)) return;
    const controller = new AbortController();
    let timer = 0;

    const poll = () => {
      api<Instructions>(`/api/donations/${order}/instructions`, { signal: controller.signal })
        .then((instructions) => {
          setView({ kind: "ready", instructions });
          if (instructions.status === "created" || instructions.status === "awaiting") {
            timer = window.setTimeout(poll, 4000);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setView({ kind: "missing" });
        });
    };

    poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [order]);

  if (view.kind === "loading") {
    return (
      <PublicPage kicker="繳費">
        <ResultPanel state="loading" />
      </PublicPage>
    );
  }
  if (view.kind === "missing") {
    return (
      <PublicPage kicker="繳費">
        <ResultPanel state="missing" />
      </PublicPage>
    );
  }

  const instructions = view.instructions;
  if (instructions.status === "succeeded") {
    return (
      <PublicPage kicker="繳費">
        <ResultPanel state="thanks" amountMinor={instructions.amountMinor} />
      </PublicPage>
    );
  }
  if (instructions.status === "failed") {
    return (
      <PublicPage kicker="繳費">
        <ResultPanel state="failed" amountMinor={instructions.amountMinor} />
      </PublicPage>
    );
  }
  if (instructions.status === "expired") {
    return (
      <PublicPage kicker="繳費">
        <ResultPanel state="expired" amountMinor={instructions.amountMinor} />
      </PublicPage>
    );
  }
  if (instructions.status === "created" || (instructions.payCode === null && instructions.barcodes === null)) {
    return (
      <PublicPage kicker="繳費">
        <ResultPanel state="pending" amountMinor={instructions.amountMinor} />
      </PublicPage>
    );
  }

  const overdue = instructions.expiresAt !== null && Date.parse(instructions.expiresAt) <= Date.now();
  const method = providerLabel[instructions.providerId] ?? "繳費";
  return (
    <PublicPage kicker="繳費" title={slipTitle(instructions)} lede={slipLede(instructions, overdue)}>
      <PaymentSlip instructions={instructions} method={method} overdue={overdue} />
    </PublicPage>
  );
}

function PaymentSlip({
  instructions,
  method,
  overdue,
}: {
  instructions: Instructions;
  method: string;
  overdue: boolean;
}) {
  return (
    <section className="s4n-slip" aria-live="polite">
      <p className="s4n-kicker">{method}</p>
      <p className="s4n-amount">{formatTwd(instructions.amountMinor)}</p>
      {instructions.expiresAt ? (
        <p className="ts-text">
          {overdue ? "期限已過" : "請在期限前完成"}
          <time dateTime={instructions.expiresAt}> {formatTaipei(instructions.expiresAt)}</time>
        </p>
      ) : null}
      <dl className="s4n-slip-rows">
        {instructions.bankCode ? <CopyRow label="銀行代碼" value={instructions.bankCode} /> : null}
        {instructions.payCode ? (
          <CopyRow label={instructions.bankCode ? "轉帳帳號" : "繳費代碼"} value={instructions.payCode} />
        ) : null}
        {instructions.barcodes?.map((code, index) => (
          <CopyRow key={code + index} label={`第 ${index + 1} 段條碼`} value={code} />
        ))}
      </dl>
      <p className="ts-text is-description">
        {overdue
          ? "請先不要再繳。若你已經繳了，入帳後這頁會改成已付款。"
          : "金額要完全相同。繳費完成後，這頁會改成已付款。"}
      </p>
      <Link to="/donate" className="ts-text is-link">
        回到贊助頁
      </Link>
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="s4n-slip-row">
      <dt>{label}</dt>
      <dd>
        <span className="s4n-slip-value">{value}</span>
        <button type="button" className={buttonClass({ variant: "outlined", size: "small" })} onClick={() => void copy()}>
          {copied ? "已複製" : "複製"}
        </button>
      </dd>
    </div>
  );
}

function slipTitle(instructions: Instructions): string {
  if (instructions.bankCode) return "請用 ATM 轉帳";
  if (instructions.barcodes) return "請到超商掃描條碼";
  return "請到超商輸入代碼";
}

function slipLede(instructions: Instructions, overdue: boolean): string {
  if (overdue) return "這筆繳費期限已經過了。";
  if (instructions.bankCode) return "把銀行代碼、帳號和金額核對一次再轉帳。";
  if (instructions.barcodes) return "三段條碼都要掃。請不要重複繳費。";
  return "把代碼和金額告訴超商櫃台，或在機台輸入。";
}
