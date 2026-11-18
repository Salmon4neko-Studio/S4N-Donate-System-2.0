import { useEffect, useRef, useState } from "react";
import {
  expireChatLines,
  parseChatOverlaySettings,
  readChatWireEvent,
  reduceChatLines,
  type ChatLineView,
  type ChatOverlaySettings,
} from "@s4n/plugin-chat-overlay";
import { noteEvent, readCursor, readSeen } from "./cursor";
import { formatTwd } from "./money";

type Connection = "connecting" | "open" | "reconnecting" | "denied";

export function ChatOverlay({
  token,
  transparent,
  preview,
}: {
  token: string;
  transparent: boolean;
  preview: boolean;
}) {
  const [connection, setConnection] = useState<Connection>(token === "" ? "denied" : "connecting");
  const [settings, setSettings] = useState<ChatOverlaySettings>(() => parseChatOverlaySettings({}));
  const [lines, setLines] = useState<ChatLineView[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const showHint = preview || !transparent;

  useEffect(() => {
    if (token === "") return;
    let socket: WebSocket | null = null;
    let timer = 0;
    let closed = false;
    let seen = readSeen("official.chat-overlay");
    let cursor = readCursor("official.chat-overlay");

    const connect = () => {
      setConnection((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      socket = new WebSocket(socketUrl(token, cursor));
      socket.addEventListener("open", () => setConnection("open"));
      socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const next = readSocketMessage(message.data);
        if (next.kind === "settings") {
          setSettings(parseChatOverlaySettings(next.settings));
          if (next.sequence !== null) {
            const noted = noteEvent("official.chat-overlay", seen, "", next.sequence, cursor);
            cursor = noted.cursor;
          }
          return;
        }
        if (next.kind === "event") {
          const noted = noteEvent("official.chat-overlay", seen, next.id, next.sequence, cursor);
          seen = noted.seen;
          cursor = noted.cursor;
          if (!noted.fresh) return;
          setLines((current) => reduceChatLines(current, next.event, settingsRef.current, Date.now()));
        }
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
  }, [token]);

  useEffect(() => {
    if (settings.lifetimeSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLines((current) => expireChatLines(current, settings, Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [settings]);

  const connectionLabel =
    connection === "open" ? "已連線" : connection === "reconnecting" ? "重新連線中" : connection === "denied" ? "權杖無效" : "連線中";

  return (
    <main className="chat-overlay">
      <p className="sr-only" role="status">
        {connectionLabel}
      </p>
      {showHint && lines.length === 0 ? (
        <p className="chat-waiting">
          {connection === "denied" ? "這個網址的權杖無效。請從工作台複製新的聊天疊層網址。" : `聊天疊層${connectionLabel}。等待訊息。`}
        </p>
      ) : null}
      <ol className="chat-lines" aria-live="polite">
        {lines.map((line) =>
          line.donation ? <DonationLine key={line.messageId} line={line} /> : <ChatLine key={line.messageId} line={line} />,
        )}
      </ol>
    </main>
  );
}

function ChatLine({ line }: { line: ChatLineView }) {
  return (
    <li className="chat-line">
      {line.badges.map((badge, index) => (
        <BadgeView key={`${badge.title}-${index}`} badge={badge} />
      ))}
      <span className="chat-name" style={{ color: line.nameColor }}>
        {line.displayName}
      </span>
      <span className="chat-body">
        {line.parts.map((part, index) =>
          part.type === "text" ? (
            <span key={index}>{part.text}</span>
          ) : (
            <EmoteView key={index} name={part.name} imageUrl={part.imageUrl} />
          ),
        )}
      </span>
    </li>
  );
}

function DonationLine({ line }: { line: ChatLineView }) {
  const donation = line.donation;
  if (donation === null) return null;
  const message = line.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return (
    <li className="chat-donation">
      <p className="chat-kicker">{donation.test ? "測試贊助" : "贊助"}</p>
      <p>
        <span className="chat-name">{line.displayName}</span>
        <span className="chat-amount">
          {donation.currency === "TWD" ? formatTwd(donation.amountMinor) : `${donation.amountMinor} ${donation.currency}`}
        </span>
      </p>
      {message ? <p className="chat-body">{message}</p> : null}
    </li>
  );
}

function BadgeView({ badge }: { badge: ChatLineView["badges"][number] }) {
  const [failed, setFailed] = useState(false);
  if (badge.imageUrl && !failed) {
    return (
      <img
        className="chat-badge"
        src={badge.imageUrl}
        alt={badge.title}
        title={badge.title}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="chat-badge-fallback">{badge.title}</span>;
}

function EmoteView({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <img
        className="chat-emote"
        src={imageUrl}
        alt={name}
        title={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span>{name}</span>;
}

function socketUrl(token: string, since: string | null): string {
  const httpUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/overlay";
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  url.searchParams.set("plugin", "official.chat-overlay");
  if (since !== null) url.searchParams.set("since", since);
  return url.toString();
}

function readSocketMessage(
  raw: string,
):
  | { kind: "settings"; settings: Record<string, unknown>; sequence: string | null }
  | { kind: "event"; id: string; sequence: string | null; event: NonNullable<ReturnType<typeof readChatWireEvent>> }
  | { kind: "ignore" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: "ignore" };
  }
  if (!isRecord(parsed)) return { kind: "ignore" };
  if (parsed.channel === "system") {
    return {
      kind: "settings",
      settings: isRecord(parsed.settings) ? parsed.settings : {},
      sequence: typeof parsed.sequence === "string" ? parsed.sequence : null,
    };
  }
  if (parsed.channel !== "event" || !isRecord(parsed.event)) return { kind: "ignore" };
  const event = readChatWireEvent(parsed.event);
  if (event === null || typeof parsed.event.id !== "string") return { kind: "ignore" };
  return {
    kind: "event",
    id: parsed.event.id,
    sequence: typeof parsed.event.sequence === "string" ? parsed.event.sequence : null,
    event,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
