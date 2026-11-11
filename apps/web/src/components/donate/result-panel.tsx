import { Link } from "react-router";
import { formatTwd } from "@/lib/money";

export type DonateResultState = "thanks" | "failed" | "pending" | "cancelled" | "missing" | "loading";

const copy: Record<DonateResultState, { title: string; body: string }> = {
  loading: { title: "正在確認付款", body: "正在讀取這筆訂單。" },
  pending: { title: "正在確認付款", body: "金流通知可能晚一點到。這頁會再查一次。如果沒有完成付款，不會入帳。" },
  thanks: { title: "謝謝你的贊助", body: "這筆付款已經記下。若提醒疊層有開著，會顯示這則贊助。" },
  failed: { title: "這筆付款沒有完成", body: "沒有入帳。若信用卡已經請款，請聯絡這位創作者。" },
  cancelled: { title: "你回到了贊助頁", body: "如果沒有完成付款，這筆不會入帳。" },
  missing: { title: "找不到這筆訂單", body: "請從贊助頁重新開始。" },
};

export function ResultPanel({ state, amountMinor }: { state: DonateResultState; amountMinor?: number }) {
  const text = copy[state];
  return (
    <section className="mt-8 flex flex-col gap-4" aria-live="polite">
      <h1 className="font-serif text-4xl leading-tight text-balance">{text.title}</h1>
      {amountMinor !== undefined ? <p className="text-lg text-cinnabar">{formatTwd(amountMinor)}</p> : null}
      <p className="text-base leading-7 text-ink-soft">{text.body}</p>
      <Link to="/donate" className="text-sm text-indigo underline-offset-4 hover:underline">
        回到贊助頁
      </Link>
    </section>
  );
}
