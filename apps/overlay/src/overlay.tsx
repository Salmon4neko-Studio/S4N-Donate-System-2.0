import { useEffect, useState } from "react";
import type { AnyS4nEvent } from "@s4n/events";

type Connection = "connecting" | "open" | "reconnecting";

interface ShownEvent {
  id: string;
  label: string;
}

export function Overlay({ transparent }: { transparent: boolean }) {
  const [connection, setConnection] = useState<Connection>("connecting");
  const [events, setEvents] = useState<ShownEvent[]>([]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer = 0;
    let closed = false;

    const connect = () => {
      setConnection((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      socket = new WebSocket(socketUrl());
      socket.addEventListener("open", () => setConnection("open"));
      socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const shown = readEvent(message.data);
        if (shown === null) return;
        setEvents((current) => [shown, ...current].slice(0, 4));
      });
      socket.addEventListener("close", () => {
        if (closed) return;
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
  }, []);

  const connectionLabel =
    connection === "open" ? "已連線" : connection === "reconnecting" ? "重新連線中" : "連線中";

  return (
    <main className="flex min-h-svh items-end p-6 md:items-center md:justify-center md:p-10">
      <section
        className={[
          "w-full max-w-md rounded-card border border-line p-6 shadow-soft",
          transparent ? "bg-paper-raised/90" : "bg-paper-raised",
        ].join(" ")}
        aria-live="polite"
      >
        <p className="text-xs tracking-[0.18em] text-cinnabar">疊層</p>
        <h1 className="mt-3 font-serif text-3xl leading-tight">等待事件</h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          OBS 瀏覽器來源。這個骨架只顯示事件種類，不把贊助人名稱或留言畫成提醒。
          {transparent ? " 目前是透明底。" : " 加上 ?transparent=1 會改成透明底。"}
        </p>
        <p className="mt-5 text-sm text-indigo">{connectionLabel}</p>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">尚未收到事件。</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id} className="font-mono text-xs text-ink">
                {event.label}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function socketUrl(): string {
  const httpUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8787";
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/overlay";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function readEvent(raw: string): ShownEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.channel !== "event" || !isRecord(parsed.event)) return null;
  const event = parsed.event;
  if (typeof event.type !== "string" || typeof event.id !== "string") return null;
  try {
    return { id: event.id, label: describe(event as unknown as AnyS4nEvent) };
  } catch {
    return null;
  }
}

function describe(event: AnyS4nEvent): string {
  switch (event.type) {
    case "s4n.donation.created":
      return `${event.type} · ${event.payload.amountMinor} ${event.payload.currency}`;
    case "s4n.donation.succeeded":
      return `${event.type} · ${event.payload.amountMinor} ${event.payload.currency}`;
    case "s4n.donation.failed":
      return `${event.type} · ${event.payload.reason}`;
    case "s4n.chat.message":
      return `${event.type} · ${event.payload.platform}`;
    case "s4n.goal.updated":
      return `${event.type} · ${event.payload.currentMinor}/${event.payload.targetMinor}`;
    case "s4n.tts.request":
      return event.type;
    case "s4n.media.now_playing":
      return `${event.type} · ${event.payload.title}`;
    default: {
      const unexpected: never = event;
      throw new Error(`unexpected event ${JSON.stringify(unexpected)}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
