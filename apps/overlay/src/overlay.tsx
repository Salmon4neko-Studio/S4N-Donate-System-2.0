import { useEffect, useState } from "react";
import { alertDurationMs, readDonationAlert, type DonationAlert } from "@s4n/plugin-alerts";
import { formatTwd } from "./money";

type Connection = "connecting" | "open" | "reconnecting" | "denied";

export function Overlay({
  token,
  pluginId,
  transparent,
  preview,
}: {
  token: string;
  pluginId: string;
  transparent: boolean;
  preview: boolean;
}) {
  const [connection, setConnection] = useState<Connection>(token === "" ? "denied" : "connecting");
  const [alert, setAlert] = useState<DonationAlert | null>(null);
  const [durationMs, setDurationMs] = useState(12_000);
  const showChrome = !transparent || preview;

  useEffect(() => {
    if (token === "") return;
    let socket: WebSocket | null = null;
    let timer = 0;
    let closed = false;

    const connect = () => {
      setConnection((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      socket = new WebSocket(socketUrl(token, pluginId));
      socket.addEventListener("open", () => setConnection("open"));
      socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const next = readSocketMessage(message.data);
        if (next.kind === "settings") setDurationMs(next.durationMs);
        if (next.kind === "alert") setAlert(next.alert);
      });
      socket.addEventListener("close", (event) => {
        if (closed) return;
        if (event.code === 4001) {
          setConnection("denied");
          return;
        }
        setConnection("reconnecting");
        timer = window.setTimeout(connect, 3000);
      });
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [pluginId, token]);

  useEffect(() => {
    if (alert === null) return;
    const timer = window.setTimeout(() => setAlert(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [alert, durationMs]);

  const connectionLabel =
    connection === "open" ? "已連線" : connection === "reconnecting" ? "重新連線中" : connection === "denied" ? "權杖無效" : "連線中";

  return (
    <main className="flex min-h-svh flex-col justify-end p-6 md:p-10">
      <p className="sr-only" role="status">
        {connectionLabel}
      </p>
      {showChrome && alert === null ? (
        <section className="mb-6 max-w-md text-sm leading-6 text-ink-soft">
          <p className="text-xs tracking-[0.18em] text-orange-ink">贊助提醒</p>
          <h1 className="mt-3 text-3xl font-normal tracking-[0.04em] text-ink">等待贊助</h1>
          <p className="mt-3">
            {connection === "denied"
              ? "這個網址的權杖無效。請從工作台複製新的疊層網址。"
              : `${connectionLabel}。啟用「贊助提醒」之後，測試贊助與入帳贊助會出現在這裡。`}
          </p>
          {preview ? <p className="mt-2">棋盤底只供預覽。OBS 請使用沒有 preview 的網址。</p> : null}
          {pluginId !== "official.alerts" ? <p className="mt-2">這個外掛還沒有自己的疊層畫面。</p> : null}
        </section>
      ) : null}
      {alert ? <AlertCard alert={alert} /> : null}
    </main>
  );
}

function AlertCard({ alert }: { alert: DonationAlert }) {
  return (
    <article
      className="s4n-rise w-full max-w-md rounded-card border border-line border-l-4 border-l-orange bg-paper-raised px-6 py-5 shadow-soft"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs tracking-[0.22em] text-orange-ink">{alert.test ? "測試" : "贊助"}</p>
        {alert.test ? (
          <span className="inline-flex size-11 items-center justify-center rounded-full border border-orange/70 font-normal text-xs tracking-widest text-orange-ink">
            試
          </span>
        ) : null}
      </div>
      <h2 className="mt-3 text-4xl font-normal leading-tight tracking-[0.03em] text-ink">{alert.donorName}</h2>
      <p className="mt-2 text-2xl text-orange-ink">{formatTwd(alert.amountMinor)}</p>
      {alert.message ? <p className="mt-3 text-base leading-7 text-ink-soft">{alert.message}</p> : null}
    </article>
  );
}

function socketUrl(token: string, pluginId: string): string {
  const httpUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/overlay";
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  url.searchParams.set("plugin", pluginId);
  return url.toString();
}

function readSocketMessage(
  raw: string,
): { kind: "settings"; durationMs: number } | { kind: "alert"; alert: DonationAlert } | { kind: "ignore" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: "ignore" };
  }
  if (!isRecord(parsed)) return { kind: "ignore" };
  if (parsed.channel === "system") {
    const settings = isRecord(parsed.settings) ? parsed.settings : {};
    return { kind: "settings", durationMs: alertDurationMs(settings) };
  }
  if (parsed.channel !== "event" || !isRecord(parsed.event)) return { kind: "ignore" };
  const event = parsed.event;
  if (typeof event.type !== "string" || typeof event.id !== "string" || !isRecord(event.payload)) {
    return { kind: "ignore" };
  }
  const alert = readDonationAlert(event as unknown as Parameters<typeof readDonationAlert>[0]);
  return alert === null ? { kind: "ignore" } : { kind: "alert", alert };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
