import { useState } from "react";
import { buttonClass, Note } from "@/components/fields";
import { api, type DonationRow } from "@/lib/api";
import { formatTwd } from "@/lib/money";
import { providerLabel } from "@/lib/payment";
import { formatTaipei } from "@/lib/time";

const statusLabel: Record<DonationRow["status"], string> = {
  created: "待付款",
  awaiting: "待繳費",
  succeeded: "已付款",
  expired: "已過期",
  failed: "失敗",
};

const statusClass: Record<DonationRow["status"], string> = {
  created: "ts-badge is-warning",
  awaiting: "ts-badge is-accent",
  succeeded: "ts-badge is-positive",
  expired: "ts-badge",
  failed: "ts-badge is-negative",
};

const indicatorClass: Record<DonationRow["status"], string> = {
  created: "is-warning",
  awaiting: "is-accent",
  succeeded: "is-positive",
  expired: "",
  failed: "is-negative",
};

export function DonationList({ donations, onReload }: { donations: DonationRow[]; onReload: () => void }) {
  return (
    <ul className="s4n-stack">
      {donations.map((donation) => (
        <li key={donation.id}>
          <DonationItem donation={donation} onReload={onReload} />
        </li>
      ))}
    </ul>
  );
}

function DonationItem({ donation, onReload }: { donation: DonationRow; onReload: () => void }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canReconcile =
    (donation.status === "created" || donation.status === "awaiting") &&
    providerLabel[donation.providerId] !== undefined;
  const method = providerLabel[donation.providerId] ?? donation.providerId;

  async function reconcile() {
    setPending(true);
    setNote(null);
    try {
      await api(`/api/payments/${donation.providerId}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ orderId: donation.id }),
      });
      onReload();
    } catch {
      setNote("金流沒有回覆這筆訂單。");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className={`ts-box is-raised is-start-indicated ${indicatorClass[donation.status]}`}>
      <div className="ts-content is-padded">
        <header className="s4n-split">
          <h2 className="ts-header is-large">{donation.donorName}</h2>
          <p className="ts-statistic is-accent">
            <span className="value">{formatTwd(donation.amountMinor)}</span>
          </p>
        </header>
        {donation.message ? <p className="ts-text is-description">{donation.message}</p> : null}
        <div className="ts-meta is-secondary is-small">
          <span className="item">
            <span className="s4n-visually-hidden">狀態</span>
            <span className={statusClass[donation.status]}>{statusLabel[donation.status]}</span>
          </span>
          <span className="item">
            <span className="s4n-visually-hidden">付款方式</span>
            {method}
          </span>
          <span className="item">
            <span className="s4n-visually-hidden">時間</span>
            <time dateTime={donation.createdAt}>{formatTaipei(donation.createdAt)}</time>
          </span>
        </div>
        <PaymentHint donation={donation} />
        {canReconcile ? (
          <div className="s4n-choices">
            <button
              type="button"
              className={buttonClass({ variant: "outlined", size: "small", icon: "start", loading: pending })}
              disabled={pending}
              onClick={() => void reconcile()}
            >
              <span className="ts-icon is-rotate-icon" aria-hidden="true" />
              {pending ? "查詢中…" : "向金流查詢"}
            </button>
            {note ? <Note tone="danger">{note}</Note> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PaymentHint({ donation }: { donation: DonationRow }) {
  if (donation.status !== "awaiting" && donation.status !== "expired") return null;
  const bits: string[] = [];
  if (donation.bankCode) bits.push(`銀行 ${donation.bankCode}`);
  if (donation.payCode) bits.push(donation.bankCode ? `帳號 ${donation.payCode}` : `代碼 ${donation.payCode}`);
  if (donation.barcodes) bits.push(donation.barcodes.join(" · "));
  if (donation.expiresAt) bits.push(`期限 ${formatTaipei(donation.expiresAt)}`);
  if (bits.length === 0) return null;
  return <p className="ts-text is-description s4n-slip-hint">{bits.join("　")}</p>;
}
