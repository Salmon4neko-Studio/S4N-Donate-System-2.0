import { useEffect, useState, type CSSProperties } from "react";
import { parseTickerSettings, tickerDurationSec } from "s4n-donate-system-2.0-plugin-ticker";
import { overlayStatusLine, type OverlayConnection } from "./status";

const PLUGIN_ID = "official.ticker";

export function TickerOverlay({ token, transparent, preview }: { token: string; transparent: boolean; preview: boolean }) {
  const [connection, setConnection] = useState<OverlayConnection>(token === "" ? "denied" : "connecting");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [reducedMotion, setReducedMotion] = useState(false);
  const appearance = parseTickerSettings(settings);
  const line = typeof settings.marquee === "string" ? settings.marquee : "";
  const statusLine = overlayStatusLine({ preview, kind: "ticker", connection, idle: line === "" });
  const duration = tickerDurationSec(line, appearance.speed);

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

    const connect = () => {
      setConnection((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      socket = new WebSocket(socketUrl(token));
      socket.addEventListener("open", () => setConnection("open"));
      socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const next = readSettings(message.data);
        if (next !== null) setSettings(next);
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

  const style = {
    "--ticker-text": appearance.textColor,
    "--ticker-primary": appearance.primaryColor,
    "--ticker-secondary": appearance.secondaryColor,
    "--ticker-duration": `${duration}s`,
  } as CSSProperties;

  return (
    <div className={`ticker-layer ${appearance.direction === "right" ? "is-right" : "is-left"}`} style={style}>
      {statusLine ? <p className="overlay-hint">{statusLine}</p> : null}
      {line !== "" ? <p className="sr-only">{line}</p> : null}
      {line !== "" ? (
        <div className={reducedMotion ? "ticker-viewport is-still" : "ticker-viewport"}>
          <p className="ticker-track">
            <span>{line}</span>
            {reducedMotion ? null : <span aria-hidden="true">{line}</span>}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function socketUrl(token: string): string {
  const httpUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/overlay";
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  url.searchParams.set("plugin", PLUGIN_ID);
  return url.toString();
}

function readSettings(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.channel !== "system") return null;
  return isRecord(parsed.settings) ? parsed.settings : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
