import { Link } from "react-router";
import { formatTwd } from "@/lib/money";

export type DonateResultState = "thanks" | "failed" | "pending" | "cancelled" | "missing" | "loading";

const copy: Record<DonateResultState, { title: string; body: string; icon: string }> = {
  loading: { title: "正在確認付款", body: "正在讀取這筆訂單。", icon: "ts-icon is-clock-icon is-huge" },
  pending: {
    title: "正在確認付款",
    body: "金流通知可能晚一點到。這頁會再查一次。如果沒有完成付款，不會入帳。",
    icon: "ts-icon is-clock-icon is-huge",
  },
  thanks: { title: "謝謝你的贊助", body: "這筆付款已經記下。若提醒疊層有開著，會顯示這則贊助。", icon: "ts-icon is-circle-check-icon is-huge is-positive" },
  failed: { title: "這筆付款沒有完成", body: "沒有入帳。若信用卡已經請款，請聯絡這位創作者。", icon: "ts-icon is-circle-xmark-icon is-huge is-negative" },
  cancelled: { title: "你回到了贊助頁", body: "如果沒有完成付款，這筆不會入帳。", icon: "ts-icon is-ban-icon is-huge" },
  missing: { title: "找不到這筆訂單", body: "請從贊助頁重新開始。", icon: "ts-icon is-triangle-exclamation-icon is-huge is-negative" },
};

export function ResultPanel({ state, amountMinor }: { state: DonateResultState; amountMinor?: number }) {
  const text = copy[state];
  return (
    <section className="s4n-stack" aria-live="polite">
      <span className={`${text.icon} s4n-result-icon`} aria-hidden="true" />
      <h1 className="ts-header is-huge">{text.title}</h1>
      {amountMinor !== undefined ? <p className="s4n-amount">{formatTwd(amountMinor)}</p> : null}
      <p className="ts-text is-description s4n-lede">{text.body}</p>
      <Link to="/donate" className="ts-text is-link">
        回到贊助頁
      </Link>
    </section>
  );
}
