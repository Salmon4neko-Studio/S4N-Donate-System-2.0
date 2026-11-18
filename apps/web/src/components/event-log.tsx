import { useEffect, useState } from "react";
import { acceptEventId, nextCursor } from "@s4n/events";
import { Note } from "@/components/fields";
import { api, type EventLogEntry, type EventLogResponse } from "@/lib/api";
import { formatTaipei } from "@/lib/time";

type Connection = "connecting" | "open" | "reconnecting" | "closed";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      retention: EventLogResponse["retention"];
      eventLog: EventLogResponse["eventLog"];
      events: EventLogEntry[];
      connection: Connection;
    };

const typeLabel: Record<string, string> = {
  "s4n.donation.created": "建立訂單",
  "s4n.donation.succeeded": "入帳",
  "s4n.donation.failed": "未成功",
  "s4n.donation.test": "測試",
  "s4n.chat.message": "聊天",
  "s4n.chat.delete": "刪除訊息",
  "s4n.chat.clear": "清空聊天",
  "s4n.goal.updated": "目標",
  "s4n.tts.request": "語音",
  "s4n.media.now_playing": "播放",
  "s4n.plugin.changed": "外掛",
};

export function EventLog({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let socket: WebSocket | null = null;
    let timer = 0;
    let closed = false;
    let seen: string[] = [];
    let cursor: string | null = null;

    const connect = () => {
      setState((current) => (current.status === "ready" ? { ...current, connection: current.connection === "connecting" ? "connecting" : "reconnecting" } : current));
      socket = new WebSocket(dashboardSocketUrl(cursor));
      socket.addEventListener("open", () => {
        setState((current) => (current.status === "ready" ? { ...current, connection: "open" } : current));
      });
      socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const next = readDashboardMessage(message.data);
        if (next === null) return;
        if (next.kind === "cursor") {
          cursor = nextCursor(cursor, next.sequence);
          return;
        }
        const decision = acceptEventId(seen, next.event.id, 500);
        seen = decision.seen;
        cursor = nextCursor(cursor, next.event.sequence);
        if (!decision.fresh) return;
        setState((current) => {
          if (current.status !== "ready") return current;
          return { ...current, events: mergeEvents(current.events, next.event) };
        });
      });
      socket.addEventListener("close", () => {
        if (closed) return;
        setState((current) => (current.status === "ready" ? { ...current, connection: "reconnecting" } : current));
        timer = window.setTimeout(connect, 3_000);
      });
    };

    api<EventLogResponse>("/api/events?limit=30", { signal: controller.signal })
      .then((body) => {
        if (closed) return;
        seen = body.events.map((event) => event.id);
        cursor = body.head;
        setState({
          status: "ready",
          retention: body.retention,
          eventLog: body.eventLog,
          events: body.events,
          connection: "connecting",
        });
        connect();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!closed) setState({ status: "error" });
      });

    return () => {
      closed = true;
      controller.abort();
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [refreshKey]);

  return (
    <section className="ts-box is-raised is-top-indicated" aria-labelledby="event-log-title">
      <div className="ts-content is-padded">
        <div className="ts-header is-large is-start-icon" id="event-log-title">
          <span className="ts-icon is-clock-rotate-left-icon" aria-hidden="true" />
          事件紀錄
        </div>
        <p className="ts-text is-description">
          這裡是送給疊層的事件，不是帳本。測試贊助會留到保留期限，但不會變成已付款。斷線的 OBS 會用序號把錯過的事件補上，同一則不會再顯示一次。
        </p>
        {state.status === "loading" ? <p className="ts-text is-description">正在讀取事件紀錄…</p> : null}
        {state.status === "error" ? <Note tone="danger">事件紀錄沒有回應。請確認資料庫已啟動。</Note> : null}
        {state.status === "ready" ? (
          <>
            <div className="ts-wrap is-middle-aligned" role="status">
              <span className="ts-badge is-outlined">{connectionLabel(state.connection)}</span>
              <span className="ts-badge is-outlined">
                {state.eventLog === "postgres" ? "存在資料庫" : "只在這個程序"}
              </span>
              <span className="ts-badge is-outlined">聊天 {state.retention.chatHours} 小時</span>
              <span className="ts-badge is-outlined">其他 {state.retention.defaultDays} 天</span>
            </div>
            {state.events.length === 0 ? (
              <p className="ts-text is-description">還沒有事件。送出上方的測試贊助後，會出現在這裡。</p>
            ) : (
              <div className="s4n-event-scroll">
                <table className="ts-table is-small">
                  <thead>
                    <tr>
                      <th scope="col">序號</th>
                      <th scope="col">時間</th>
                      <th scope="col">類型</th>
                      <th scope="col">內容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.events.map((event) => (
                      <tr key={event.id}>
                        <td>{event.sequence}</td>
                        <td>{formatTaipei(event.occurredAt)}</td>
                        <td>
                          <span className={event.type === "s4n.donation.test" ? "ts-badge is-accent" : "ts-badge is-outlined"}>
                            {typeLabel[event.type] ?? "事件"}
                          </span>
                        </td>
                        <td>{event.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

function connectionLabel(connection: Connection): string {
  if (connection === "open") return "即時已連線";
  if (connection === "reconnecting") return "重新連線中";
  if (connection === "closed") return "即時已中斷";
  return "正在連線";
}

function mergeEvents(current: readonly EventLogEntry[], incoming: EventLogEntry): EventLogEntry[] {
  const without = current.filter((event) => event.id !== incoming.id);
  return [...without, incoming]
    .sort((left, right) => {
      const a = BigInt(left.sequence);
      const b = BigInt(right.sequence);
      if (a === b) return 0;
      return a > b ? -1 : 1;
    })
    .slice(0, 30);
}

function dashboardSocketUrl(since: string | null): string {
  const httpUrl = import.meta.env.DEV ? window.location.origin : (import.meta.env.VITE_API_URL ?? "http://localhost:8787");
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/dashboard";
  url.search = "";
  url.hash = "";
  if (since !== null) url.searchParams.set("since", since);
  return url.toString();
}

function readDashboardMessage(
  raw: string,
): { kind: "cursor"; sequence: string } | { kind: "event"; event: EventLogEntry } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.channel === "system" && typeof parsed.sequence === "string") {
    return { kind: "cursor", sequence: parsed.sequence };
  }
  if (parsed.channel !== "event" || !isRecord(parsed.event)) return null;
  const event = parsed.event;
  if (
    typeof event.sequence !== "string" ||
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    typeof event.occurredAt !== "string" ||
    typeof event.summary !== "string"
  ) {
    return null;
  }
  return {
    kind: "event",
    event: {
      sequence: event.sequence,
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      summary: event.summary,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
