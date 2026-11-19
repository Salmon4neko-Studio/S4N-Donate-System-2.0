import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  alertExitHoldMs,
  parseAlertAppearance,
  readDonationAlert,
  renderAlertCopy,
  type AlertAppearance,
  type DonationAlert,
} from "@s4n/plugin-alerts";
import { apiOrigin } from "./api-origin";
import { noteEvent, readCursor, readSeen } from "./cursor";

const PLUGIN_ID = "official.alerts";
type Connection = "connecting" | "open" | "reconnecting" | "denied";

export function Overlay({
  token,
  transparent,
  preview,
}: {
  token: string;
  transparent: boolean;
  preview: boolean;
}) {
  const [connection, setConnection] = useState<Connection>(token === "" ? "denied" : "connecting");
  const [alert, setAlert] = useState<DonationAlert | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [appearance, setAppearance] = useState<AlertAppearance>(() => parseAlertAppearance({}));
  const [reducedMotion, setReducedMotion] = useState(false);
  const queueRef = useRef<DonationAlert[]>([]);
  const showHint = preview || !transparent;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (token === "") return;
    let socket: WebSocket | null = null;
    let timer = 0;
    let closed = false;
    let seen = readSeen(PLUGIN_ID);
    let cursor = readCursor(PLUGIN_ID);

    const connect = () => {
      setConnection((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      socket = new WebSocket(socketUrl(token, cursor));
      socket.addEventListener("open", () => setConnection("open"));
      socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const next = readSocketMessage(message.data);
        if (next.kind === "settings") {
          setAppearance(parseAlertAppearance(next.settings));
          if (next.sequence !== null) {
            const noted = noteEvent(PLUGIN_ID, seen, "", next.sequence, cursor);
            cursor = noted.cursor;
          }
          return;
        }
        if (next.kind === "alert") {
          const noted = noteEvent(PLUGIN_ID, seen, next.alert.id, next.sequence, cursor);
          seen = noted.seen;
          cursor = noted.cursor;
          if (noted.fresh) enqueue(next.alert);
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

  function enqueue(next: DonationAlert) {
    setAlert((current) => {
      if (current === null && queueRef.current.length === 0) return next;
      if (queueRef.current.length >= 50) queueRef.current.shift();
      queueRef.current.push(next);
      return current;
    });
  }

  useEffect(() => {
    if (alert === null) return;
    setPhase("in");
    const timer = window.setTimeout(() => setPhase("out"), appearance.durationMs);
    return () => window.clearTimeout(timer);
  }, [alert, appearance.durationMs]);

  useEffect(() => {
    if (alert === null || phase !== "out") return;
    const timer = window.setTimeout(() => {
      setPhase("in");
      setAlert(queueRef.current.shift() ?? null);
    }, alertExitHoldMs(reducedMotion));
    return () => window.clearTimeout(timer);
  }, [alert, phase, reducedMotion]);

  const connectionLabel =
    connection === "open" ? "已連線" : connection === "reconnecting" ? "重新連線中" : connection === "denied" ? "權杖無效" : "連線中";
  const copy = alert === null ? null : renderAlertCopy(alert, appearance);
  const motion = phase === "out" ? appearance.exitAnimation : appearance.enterAnimation;

  return (
    <div className="alert-layer">
      <p className="sr-only" role="status">
        {connectionLabel}
      </p>
      {showHint && alert === null ? (
        <p className="overlay-hint">{connection === "denied" ? "權杖無效。" : `贊助提醒${connectionLabel}。等待贊助。`}</p>
      ) : null}
      {alert && copy ? (
        <article
          className={`s4n-alert-card s4n-${phase === "out" ? "exit" : "enter"}-${motion}`}
          style={alertStyle(appearance)}
          aria-live="polite"
        >
          <p className="s4n-alert-kicker">{alert.test ? "測試" : "贊助"}</p>
          {copy.title ? <h2 className="s4n-alert-title">{copy.title}</h2> : null}
          {copy.body ? <p className="s4n-alert-body">{copy.body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

function alertStyle(appearance: AlertAppearance): CSSProperties {
  return {
    "--s4n-alert-primary": appearance.primaryColor,
    "--s4n-alert-secondary": appearance.secondaryColor,
    "--s4n-alert-title": appearance.titleColor,
    "--s4n-alert-body": appearance.bodyColor,
  } as CSSProperties;
}

function socketUrl(token: string, since: string | null): string {
  const url = new URL(apiOrigin());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/overlay";
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  url.searchParams.set("plugin", PLUGIN_ID);
  if (since !== null) url.searchParams.set("since", since);
  return url.toString();
}

function readSocketMessage(
  raw: string,
):
  | { kind: "settings"; settings: Record<string, unknown>; sequence: string | null }
  | { kind: "alert"; alert: DonationAlert; sequence: string | null }
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
  const event = parsed.event;
  if (typeof event.type !== "string" || typeof event.id !== "string" || !isRecord(event.payload)) {
    return { kind: "ignore" };
  }
  const alert = readDonationAlert(event as unknown as Parameters<typeof readDonationAlert>[0]);
  if (alert === null) return { kind: "ignore" };
  return { kind: "alert", alert, sequence: typeof event.sequence === "string" ? event.sequence : null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
