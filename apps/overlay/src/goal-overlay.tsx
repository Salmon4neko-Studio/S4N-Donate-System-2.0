import { useEffect, useState, type CSSProperties } from "react";
import { goalAchieved, goalPercent, parseGoalSettings } from "s4n-donate-system-2.0-plugin-goals";
import { noteEvent, readCursor, readSeen } from "./cursor";
import { overlayStatusLine, type OverlayConnection } from "./status";
import { formatTwd } from "./money";

const PLUGIN_ID = "official.goals";

export function GoalOverlay({ token, transparent, preview }: { token: string; transparent: boolean; preview: boolean }) {
  const [connection, setConnection] = useState<OverlayConnection>(token === "" ? "denied" : "connecting");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [reducedMotion, setReducedMotion] = useState(false);
  const statusLine = overlayStatusLine({ preview, kind: "goals", connection });
  const appearance = parseGoalSettings(settings);
  const currentMinor = readCurrent(settings.currentMinor);
  const percent = goalPercent(currentMinor, appearance.targetMinor);
  const achieved = goalAchieved(currentMinor, appearance.targetMinor);

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
          setSettings(next.settings);
          if (next.sequence !== null) {
            const noted = noteEvent(PLUGIN_ID, seen, "", next.sequence, cursor);
            cursor = noted.cursor;
          }
          return;
        }
        if (next.kind === "goal") {
          const noted = noteEvent(PLUGIN_ID, seen, next.id, next.sequence, cursor);
          seen = noted.seen;
          cursor = noted.cursor;
          if (!noted.fresh) return;
          setSettings((current) => ({
            ...current,
            title: next.title,
            targetMinor: next.targetMinor,
            currentMinor: next.currentMinor,
          }));
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

  const style = {
    "--goal-text": appearance.textColor,
    "--goal-primary": appearance.primaryColor,
    "--goal-secondary": appearance.secondaryColor,
  } as CSSProperties;

  return (
    <div className="goal-layer" style={style}>
      {statusLine ? <p className="overlay-hint">{statusLine}</p> : null}
      <p className="sr-only">{achieved ? "目標達成" : ""}</p>
      <article className={achieved && !reducedMotion ? "goal-card is-achieved" : "goal-card"}>
        <div className="goal-row">
          <h2 className="goal-title">{appearance.title}</h2>
          {achieved ? <p className="goal-badge">達成</p> : null}
        </div>
        <p className="goal-amounts">
          {formatTwd(currentMinor)} / {formatTwd(appearance.targetMinor)}
          <span className="goal-percent">{percent}%</span>
        </p>
        <div className="goal-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={appearance.title}>
          <div className="goal-fill" style={{ width: `${percent}%` }} />
        </div>
      </article>
    </div>
  );
}

function readCurrent(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return 0;
  return value;
}

function socketUrl(token: string, since: string | null): string {
  const httpUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const url = new URL(httpUrl);
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
  | { kind: "goal"; id: string; title: string; currentMinor: number; targetMinor: number; sequence: string | null }
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
  if (event.type !== "s4n.goal.updated" || typeof event.id !== "string" || !isRecord(event.payload)) {
    return { kind: "ignore" };
  }
  const payload = event.payload;
  if (typeof payload.title !== "string" || typeof payload.currentMinor !== "number" || typeof payload.targetMinor !== "number") {
    return { kind: "ignore" };
  }
  return {
    kind: "goal",
    id: event.id,
    title: payload.title,
    currentMinor: payload.currentMinor,
    targetMinor: payload.targetMinor,
    sequence: typeof event.sequence === "string" ? event.sequence : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
