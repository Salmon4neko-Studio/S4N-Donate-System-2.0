import { useState } from "react";
import { buttonClass, Note } from "@/components/fields";
import { api, type DonationRow } from "@/lib/api";
import { formatTwd } from "@/lib/money";
import { providerLabel } from "@/lib/payment";
import { formatTaipei } from "@/lib/time";

const statusLabel: Record<DonationRow["status"], string> = {
  created: "待付款",
  succeeded: "已付款",
  failed: "未成功",
};

const statusClass: Record<DonationRow["status"], string> = {
  created: "ts-badge is-warning",
  succeeded: "ts-badge is-positive",
  failed: "ts-badge is-negative",
};

const indicatorClass: Record<DonationRow["status"], string> = {
  created: "is-warning",
  succeeded: "is-positive",
  failed: "is-negative",
};

export function DonationList({ donations, onChange }: { donations: DonationRow[]; onChange: (next: DonationRow[]) => void }) {
  return (
    <ul className="s4n-stack">
      {donations.map((donation) => (
        <li key={donation.id}>
          <DonationItem donation={donation} onChange={onChange} />
        </li>
      ))}
    </ul>
  );
}

function DonationItem({
  donation,
  onChange,
}: {
  donation: DonationRow;
  onChange: (next: DonationRow[]) => void;
}) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canReconcile = donation.status === "created" && providerLabel[donation.providerId] !== undefined;

  async function reconcile() {
    setPending(true);
    setNote(null);
    try {
      await api(`/api/payments/${donation.providerId}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ orderId: donation.id }),
      });
      const body = await api<{ donations: DonationRow[] }>("/api/donations");
      onChange(body.donations);
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
            <span className="s4n-visually-hidden">付款</span>
            {providerLabel[donation.providerId] ?? donation.providerId}
          </span>
          <span className="item">
            <span className="s4n-visually-hidden">時間</span>
            <time dateTime={donation.createdAt}>{formatTaipei(donation.createdAt)}</time>
          </span>
        </div>
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
