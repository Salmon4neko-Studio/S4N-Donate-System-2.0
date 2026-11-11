import { useEffect, useState } from "react";
import { DonationList } from "@/components/donation-list";
import { api, type DonationRow } from "@/lib/api";

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
      <header className="max-w-2xl">
        <p className="text-xs tracking-[0.18em] text-cinnabar">帳本</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">贊助紀錄</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          這裡只讀核心帳本。測試贊助不會出現。名稱與留言是贊助人輸入的文字。時間以台北時間顯示。
        </p>
      </header>

      {state.status === "loading" ? <p className="text-sm text-ink-soft">正在讀取帳本…</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-cinnabar" role="status">
          帳本沒有回應。
        </p>
      ) : null}
      {state.status === "ready" && state.donations.length === 0 ? <EmptyLedger /> : null}
      {state.status === "ready" && state.donations.length > 0 ? (
        <DonationList
          donations={state.donations}
          onChange={(donations) => setState({ status: "ready", donations })}
        />
      ) : null}
    </div>
  );
}

function EmptyLedger() {
  return (
    <section className="max-w-xl rounded-card border border-dashed border-line bg-paper-raised/70 px-8 py-12 text-center shadow-soft">
      <h2 className="font-serif text-3xl">帳本還沒有贊助</h2>
      <p className="mt-4 text-sm leading-7 text-ink-soft">
        完成付款後，待付款、已付款和未成功都會列在這裡。測試按鈕只把預覽送到疊層。
      </p>
    </section>
  );
}
