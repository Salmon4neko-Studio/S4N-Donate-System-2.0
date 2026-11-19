/**
 * Pure helpers for the dashboard OBS preview.
 * The iframe loads the same overlay URL OBS uses. The token stays in that
 * query string and is not copied into a hash, log line, or second parameter.
 * allow-same-origin keeps the overlay's real origin so its modules and
 * WebSocket are not an opaque null origin. The dashboard is a different
 * origin, and the sandbox does not allow navigation, popups, or forms.
 */

export const SAMPLE_STAGE_PATH = "/preview/game-stage.svg";
export const CANVAS_MIN = 160;
export const CANVAS_MAX = 4096;
export const MAX_STAGE_IMAGE_BYTES = 8 * 1024 * 1024;

export const CANVAS_PRESETS = [
  { id: "1920x1080", label: "1920×1080", width: 1920, height: 1080 },
  { id: "1280x720", label: "1280×720", width: 1280, height: 720 },
  { id: "1080x1920", label: "直式 1080×1920", width: 1080, height: 1920 },
] as const;

export const STAGE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const OVERLAY_PREVIEW_IFRAME = {
  sandbox: "allow-scripts allow-same-origin",
  referrerPolicy: "no-referrer",
} as const;

const BLOB_URL = /^blob:https?:\/\/[a-z0-9.\-:[\]]+\/[a-z0-9-]+$/i;

export type StageBackground = "dark" | "light" | "green" | "sample" | "upload";

export type StageBackgroundAttr = {
  bg: "dark" | "light" | "green" | "image";
  image: string | null;
};

export function overlayPreviewSrc(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const token = url.searchParams.get("token");
  if (token === null || token === "") return null;
  url.searchParams.delete("plugin");
  url.searchParams.set("transparent", "1");
  url.searchParams.delete("preview");
  url.hash = "";
  return url.toString();
}

export function parseCanvasDimension(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < CANVAS_MIN || value > CANVAS_MAX) return null;
  return value;
}

export function containScale(
  boxWidth: number,
  boxHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  if (!(boxWidth > 0) || !(boxHeight > 0) || !(canvasWidth > 0) || !(canvasHeight > 0)) return 0;
  return Math.min(boxWidth / canvasWidth, boxHeight / canvasHeight);
}

export function safeUploadUrl(value: string | null): string | null {
  if (value === null || !BLOB_URL.test(value)) return null;
  return value;
}

export function stageBackgroundAttr(mode: StageBackground, uploadUrl: string | null): StageBackgroundAttr {
  if (mode === "sample") return { bg: "image", image: SAMPLE_STAGE_PATH };
  if (mode === "upload") {
    const image = safeUploadUrl(uploadUrl);
    if (image !== null) return { bg: "image", image };
  }
  if (mode === "light") return { bg: "light", image: null };
  if (mode === "green") return { bg: "green", image: null };
  return { bg: "dark", image: null };
}

export function visibleFileLabel(name: string): string {
  return name.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, "").slice(0, 80);
}

export function stageImageRejection(file: { type: string; size: number }): "type" | "size" | null {
  if (!(STAGE_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_STAGE_IMAGE_BYTES) return "size";
  return null;
}
