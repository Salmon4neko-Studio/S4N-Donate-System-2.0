import { useEffect, useState, type CSSProperties } from "react";
import { apiOrigin } from "./api-origin";
import { ChatOverlay } from "./chat-overlay";
import { GoalOverlay } from "./goal-overlay";
import { Overlay } from "./overlay";
import { overlayStatusLine } from "./status";
import { TickerOverlay } from "./ticker-overlay";

export interface SceneSlot {
  pluginId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneView {
  canvas: { width: number; height: number };
  slots: SceneSlot[];
}

export function OverlayStage({
  token,
  transparent,
  preview,
}: {
  token: string;
  transparent: boolean;
  preview: boolean;
}) {
  const [scene, setScene] = useState<SceneView | null>(null);
  const [denied, setDenied] = useState(token === "");
  const deniedLine = overlayStatusLine({ preview, kind: "stage-denied" });
  const emptyLine = overlayStatusLine({ preview, kind: "stage-empty" });

  useEffect(() => {
    if (token === "") return;
    let stopped = false;

    const load = async () => {
      try {
        const response = await fetch(sceneUrl(token), {
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        if (stopped) return;
        if (response.status === 401) {
          setDenied(true);
          return;
        }
        if (!response.ok) return;
        const next = readScene(await response.json());
        if (next === null) return;
        setDenied(false);
        setScene(next);
      } catch {
        // Keep the last scene. The next poll retries.
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 2_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [token]);

  return (
    <div className="overlay-stage">
      {denied && deniedLine ? <p className="overlay-hint">{deniedLine}</p> : null}
      {!denied && scene !== null && scene.slots.length === 0 && emptyLine ? <p className="overlay-hint">{emptyLine}</p> : null}
      {scene?.slots.map((slot) => (
        <section key={slot.pluginId} className="overlay-slot" style={slotStyle(slot)} data-plugin={slot.pluginId}>
          {slot.pluginId === "official.alerts" ? <Overlay token={token} transparent={transparent} preview={preview} /> : null}
          {slot.pluginId === "official.chat-overlay" ? (
            <ChatOverlay token={token} transparent={transparent} preview={preview} />
          ) : null}
          {slot.pluginId === "official.goals" ? <GoalOverlay token={token} transparent={transparent} preview={preview} /> : null}
          {slot.pluginId === "official.ticker" ? <TickerOverlay token={token} transparent={transparent} preview={preview} /> : null}
          {slot.pluginId !== "official.alerts" &&
          slot.pluginId !== "official.chat-overlay" &&
          slot.pluginId !== "official.goals" &&
          slot.pluginId !== "official.ticker" &&
          preview ? (
            <p className="overlay-hint">{slot.name}</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function slotStyle(slot: SceneSlot): CSSProperties {
  return {
    left: `${slot.x * 100}%`,
    top: `${slot.y * 100}%`,
    width: `${slot.width * 100}%`,
    height: `${slot.height * 100}%`,
  };
}

export function readScene(value: unknown): SceneView | null {
  if (!isRecord(value) || !isRecord(value.canvas) || !Array.isArray(value.slots)) return null;
  const width = value.canvas.width;
  const height = value.canvas.height;
  if (!isDimension(width) || !isDimension(height)) return null;
  const slots: SceneSlot[] = [];
  for (const item of value.slots) {
    if (!isRecord(item)) return null;
    if (typeof item.pluginId !== "string" || typeof item.name !== "string") return null;
    if (!isFraction(item.x) || !isFraction(item.y) || !isFraction(item.width) || !isFraction(item.height)) return null;
    slots.push({
      pluginId: item.pluginId,
      name: item.name,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    });
  }
  return { canvas: { width, height }, slots };
}

function sceneUrl(token: string): string {
  const url = new URL(apiOrigin());
  url.pathname = "/api/overlay/scene";
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  return url.toString();
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 160 && value <= 4096;
}

function isFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
