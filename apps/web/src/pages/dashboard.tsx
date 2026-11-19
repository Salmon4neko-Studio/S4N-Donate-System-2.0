import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { EventLog } from "@/components/event-log";
import { buttonClass, Field, Note, TextArea, TextInput } from "@/components/fields";
import { api, type HealthResponse } from "@/lib/api";
import { sendTestDonation, testDonationErrorMessage } from "@/lib/test-donation";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; health: HealthResponse }
  | { status: "error" };

type TestState = { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "error"; message: string };

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [donorName, setDonorName] = useState("夜雨");
  const [amount, setAmount] = useState(300);
  const [message, setMessage] = useState("這首歌我很喜歡");
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [eventRefresh, setEventRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<HealthResponse>("/api/health", { signal: controller.signal })
      .then((health) => setState({ status: "ready", health }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  async function onTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestState({ status: "sending" });
    try {
      await sendTestDonation({ donorName, amountMinor: amount, message });
      setTestState({ status: "sent" });
      setEventRefresh((current) => current + 1);
    } catch (error) {
      setTestState({ status: "error", message: testDonationErrorMessage(error) });
    }
  }

  return (
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">營運</p>
        <h1 className="ts-header is-huge">工作台</h1>
        <p className="ts-text is-description s4n-lede">
          從這裡送出測試贊助、打開帳本，並把疊層網址貼進 OBS。測試事件不會寫進帳本。真實贊助從贊助頁付款。
        </p>
      </header>

      <HealthLine state={state} />

      <section className="ts-box is-raised is-top-indicated">
        <div className="ts-content is-padded">
          <div className="ts-header is-large is-start-icon">
            <span className="ts-icon is-flask-icon" aria-hidden="true" />
            測試贊助
          </div>
          <p className="ts-text is-description">送給已啟用的贊助提醒。畫面上會標成測試，帳本維持空白，事件紀錄會留下這一筆。</p>
          <form onSubmit={onTest} className="ts-grid is-2-columns s4n-form-grid">
            <div className="column">
              <Field id="test-name" label="顯示名稱">
                <TextInput id="test-name" maxLength={40} value={donorName} onChange={(event) => setDonorName(event.target.value)} />
              </Field>
            </div>
            <div className="column">
              <Field id="test-amount" label="金額（新台幣）">
                <TextInput
                  id="test-amount"
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
              </Field>
            </div>
            <div className="column is-wide">
              <Field id="test-message" label="留言">
                <TextArea id="test-message" maxLength={200} value={message} onChange={(event) => setMessage(event.target.value)} />
              </Field>
            </div>
            <div className="column is-wide s4n-fields">
              <button type="submit" className={buttonClass({ tone: "accent", icon: "start", loading: testState.status === "sending" })} disabled={testState.status === "sending"}>
                <span className="ts-icon is-paper-plane-icon" aria-hidden="true" />
                {testState.status === "sending" ? "送出中…" : "送出測試贊助"}
              </button>
              {testState.status === "sent" ? (
                <Note>已送出測試事件。這筆不會進入帳本。請先在外掛頁啟用「贊助提醒」，疊層才看得到。</Note>
              ) : null}
              {testState.status === "error" ? <Note tone="danger">{testState.message}</Note> : null}
            </div>
          </form>
        </div>
      </section>

      <EventLog refreshKey={eventRefresh} />

      <section className="ts-grid is-3-columns s4n-cards">
        <article className="column ts-box is-raised is-top-indicated">
          <div className="ts-content is-padded">
            <div className="ts-header is-start-icon">
              <span className="ts-icon is-receipt-icon" aria-hidden="true" />
              帳本
            </div>
            <p className="ts-text is-description">待付款、已付款和未成功。</p>
            <p className="ts-text is-description">
              測試贊助不會出現在帳本。
              <Link to="/donations" className="ts-text is-link">
                查看帳本
              </Link>
            </p>
          </div>
          <div className="symbol" aria-hidden="true">
            <span className="ts-icon is-receipt-icon s4n-symbol" />
          </div>
        </article>
        <article className="column ts-box is-raised is-top-indicated">
          <div className="ts-content is-padded">
            <div className="ts-header is-start-icon">
              <span className="ts-icon is-display-icon" aria-hidden="true" />
              疊層
            </div>
            <p className="ts-text is-description">OBS 瀏覽器來源使用權杖網址。</p>
            <p className="ts-text is-description">
              重新產生之後，舊網址會失效。
              <Link to="/overlay" className="ts-text is-link">
                複製網址
              </Link>
            </p>
          </div>
          <div className="symbol" aria-hidden="true">
            <span className="ts-icon is-display-icon s4n-symbol" />
          </div>
        </article>
        <article className="column ts-box is-raised is-top-indicated">
          <div className="ts-content is-padded">
            <div className="ts-header is-start-icon">
              <span className="ts-icon is-puzzle-piece-icon" aria-hidden="true" />
              外掛
            </div>
            <p className="ts-text is-description">啟用、停用，以及密文。一般設定在側欄的外掛選單。</p>
            <p className="ts-text is-description">
              密文只會顯示已設定或尚未設定。
              <Link to="/plugins" className="ts-text is-link">
                打開外掛
              </Link>
            </p>
          </div>
          <div className="symbol" aria-hidden="true">
            <span className="ts-icon is-puzzle-piece-icon s4n-symbol" />
          </div>
        </article>
      </section>
    </div>
  );
}

function HealthLine({ state }: { state: LoadState }) {
  if (state.status === "loading") {
    return <p className="ts-text is-description">正在詢問核心 API…</p>;
  }
  if (state.status === "error") {
    return <Note tone="danger">核心 API 沒有回應。請確認 `pnpm dev` 已啟動。</Note>;
  }

  const database =
    state.health.database === "up"
      ? "資料庫已連線"
      : state.health.database === "down"
        ? "資料庫未連線"
        : "資料庫未設定";

  return (
    <div className="ts-wrap is-middle-aligned" role="status">
      <span className="ts-badge is-accent">核心已回應</span>
      <span className="ts-badge is-outlined">{database}</span>
      <span className="ts-badge is-outlined">付款外掛 {state.health.payments.length}</span>
      <span className="ts-badge is-outlined">
        {state.health.eventLog === "postgres" ? "事件紀錄在資料庫" : "事件紀錄在記憶體"}
      </span>
    </div>
  );
}
