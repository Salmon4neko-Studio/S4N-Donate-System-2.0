import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { api, type DonationRow } from "@/lib/api";
import { formatTwd } from "@/lib/money";

const statusLabel: Record<DonationRow["status"], string> = {
  created: "待付款",
  succeeded: "已入帳",
  failed: "未完成",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; donations: DonationRow[] }
  | { status: "error" };

export function DonationsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api<{ donations: DonationRow[] }>("/api/donations", { signal: controller.signal })
      .then((body) => setState({ status: "ready", donations: body.donations }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <p className="text-xs tracking-[0.18em] text-cinnabar">帳本</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">入帳的贊助</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          這裡只讀核心帳本。測試贊助不會出現。名稱與留言是贊助人輸入的文字，畫面上只當文字顯示。
        </p>
      </div>

      {state.status === "loading" ? <p className="text-sm text-ink-soft">正在讀取帳本…</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-cinnabar" role="status">
          帳本沒有回應。
        </p>
      ) : null}
      {state.status === "ready" && state.donations.length === 0 ? <EmptyLedger /> : null}
      {state.status === "ready" && state.donations.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {state.donations.map((donation) => (
            <li key={donation.id} className="rounded-card border border-line bg-paper-raised px-5 py-4 shadow-soft">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-serif text-2xl">{donation.donorName}</p>
                <p className="text-lg text-cinnabar">{formatTwd(donation.amountMinor)}</p>
              </div>
              {donation.message ? <p className="mt-2 text-sm leading-6 text-ink-soft">{donation.message}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <Badge variant="outline">{statusLabel[donation.status]}</Badge>
                <span>{donation.providerId}</span>
                <time dateTime={donation.createdAt}>{donation.createdAt}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyLedger() {
  return (
    <section className="max-w-xl rounded-card border border-dashed border-line bg-paper-raised/70 px-8 py-12 text-center shadow-soft">
      <p
        className="mx-auto flex size-16 items-center justify-center rounded-full border border-cinnabar/40 font-serif text-xl text-cinnabar"
        aria-hidden="true"
      >
        空
      </p>
      <h2 className="mt-6 font-serif text-3xl">帳本還是空白的</h2>
      <p className="mt-4 text-sm leading-7 text-ink-soft">
        這裡會列出已入帳的贊助。目前沒有任何一筆。這不是「今天沒有人贊助」——清單已經接上，只是付款還沒有寫進來。測試按鈕只把預覽送到疊層。
      </p>
    </section>
  );
}
