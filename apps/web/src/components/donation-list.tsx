import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type DonationRow } from "@/lib/api";
import { formatTwd } from "@/lib/money";
import { providerLabel } from "@/lib/payment";
import { formatTaipei } from "@/lib/time";

const statusLabel: Record<DonationRow["status"], string> = {
  created: "待付款",
  succeeded: "已付款",
  failed: "未成功",
};

export function DonationList({ donations, onChange }: { donations: DonationRow[]; onChange: (next: DonationRow[]) => void }) {
  return (
    <ul className="flex flex-col gap-3">
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
    <article className="rounded-card border border-line bg-paper-raised px-5 py-4 shadow-soft">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl">{donation.donorName}</h2>
        <p className="text-lg text-cinnabar">{formatTwd(donation.amountMinor)}</p>
      </header>
      {donation.message ? <p className="mt-2 text-sm leading-6 text-ink-soft">{donation.message}</p> : null}
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-soft">
        <div className="flex items-center gap-2">
          <dt className="sr-only">狀態</dt>
          <dd>
            <Badge variant="outline">{statusLabel[donation.status]}</Badge>
          </dd>
        </div>
        <div>
          <dt className="sr-only">付款</dt>
          <dd>{providerLabel[donation.providerId] ?? donation.providerId}</dd>
        </div>
        <div>
          <dt className="sr-only">時間</dt>
          <dd>
            <time dateTime={donation.createdAt}>{formatTaipei(donation.createdAt)}</time>
          </dd>
        </div>
      </dl>
      {canReconcile ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" className="h-9 px-3" disabled={pending} onClick={() => void reconcile()}>
            {pending ? "查詢中…" : "向金流查詢"}
          </Button>
          {note ? <p className="text-sm text-cinnabar">{note}</p> : null}
        </div>
      ) : null}
    </article>
  );
}
