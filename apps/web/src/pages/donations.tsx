import { useEffect, useState } from "react";
import { DonationList } from "@/components/donation-list";
import { choiceClass, Note } from "@/components/fields";
import { api, type DonationRow } from "@/lib/api";

type LedgerFilter = "" | DonationRow["status"];

const filters: ReadonlyArray<{ id: LedgerFilter; label: string }> = [
  { id: "", label: "全部" },
  { id: "created", label: "待付款" },
  { id: "awaiting", label: "待繳費" },
  { id: "succeeded", label: "已付款" },
  { id: "expired", label: "已過期" },
  { id: "review", label: "待人工處理" },
  { id: "failed", label: "失敗" },
];

type LoadState =
  | { status: "loading" }
  | { status: "ready"; donations: DonationRow[] }
  | { status: "error" };

export function DonationsPage() {
  const [filter, setFilter] = useState<LedgerFilter>("");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const query = filter === "" ? "" : `?status=${filter}`;
    api<{ donations: DonationRow[] }>(`/api/donations${query}`, { signal: controller.signal })
      .then((body) => setState({ status: "ready", donations: body.donations }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [filter]);

  return (
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">帳本</p>
        <h1 className="ts-header is-huge">贊助紀錄</h1>
        <p className="ts-text is-description s4n-lede">
          這裡只讀核心帳本。測試贊助不會出現。名稱與留言是贊助人輸入的文字。時間以台北時間顯示。
        </p>
      </header>
      <div className="s4n-choices" role="group" aria-label="帳本狀態">
        {filters.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            className={choiceClass(filter === item.id, "small")}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取帳本…</p> : null}
      {state.status === "error" ? <Note tone="danger">帳本沒有回應。</Note> : null}
      {state.status === "ready" && state.donations.length === 0 ? <EmptyLedger filtered={filter !== ""} /> : null}
      {state.status === "ready" && state.donations.length > 0 ? (
        <DonationList
          donations={state.donations}
          onReload={() => {
            const query = filter === "" ? "" : `?status=${filter}`;
            api<{ donations: DonationRow[] }>(`/api/donations${query}`)
              .then((body) => setState({ status: "ready", donations: body.donations }))
              .catch(() => setState({ status: "error" }));
          }}
        />
      ) : null}
    </div>
  );
}

function EmptyLedger({ filtered }: { filtered: boolean }) {
  return (
    <section className="ts-box is-hollowed">
      <div className="ts-blankslate">
        <span className="ts-icon is-receipt-icon" aria-hidden="true" />
        <h2 className="header">{filtered ? "這個狀態沒有訂單" : "帳本還沒有贊助"}</h2>
        <p className="description">
          {filtered
            ? "換一個狀態，或等新的訂單進來。"
            : "待付款、待繳費、已付款、已過期、待人工處理和失敗都會列在這裡。測試按鈕只把預覽送到疊層。"}
        </p>
      </div>
    </section>
  );
}
