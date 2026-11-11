import { useEffect, useState } from "react";
import { DonationList } from "@/components/donation-list";
import { Note } from "@/components/fields";
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
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">帳本</p>
        <h1 className="ts-header is-huge">贊助紀錄</h1>
        <p className="ts-text is-description s4n-lede">
          這裡只讀核心帳本。測試贊助不會出現。名稱與留言是贊助人輸入的文字。時間以台北時間顯示。
        </p>
      </header>

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取帳本…</p> : null}
      {state.status === "error" ? <Note tone="danger">帳本沒有回應。</Note> : null}
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
    <section className="ts-box is-hollowed">
      <div className="ts-blankslate">
        <span className="ts-icon is-receipt-icon" aria-hidden="true" />
        <h2 className="header">帳本還沒有贊助</h2>
        <p className="description">完成付款後，待付款、已付款和未成功都會列在這裡。測試按鈕只把預覽送到疊層。</p>
      </div>
    </section>
  );
}
