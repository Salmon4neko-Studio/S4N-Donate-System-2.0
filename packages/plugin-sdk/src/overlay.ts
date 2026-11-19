/**
 * A plugin draws on the shared OBS canvas when its manifest includes `overlaySlot`.
 * Rectangles are fractions of the canvas, so a later size change scales them.
 */

export const OVERLAY_RECT_MIN = 0.05;

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `#RGB` or `#RRGGBB`. Four and eight digit forms are rejected. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** Lowercase `#rrggbb`, or null when the value is not a legal hex color. */
export function normalizeHexColor(value: string): string | null {
  if (!isHexColor(value)) return null;
  const hex = value.slice(1).toLowerCase();
  if (hex.length === 3) {
    const r = hex.charAt(0);
    const g = hex.charAt(1);
    const b = hex.charAt(2);
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${hex}`;
}

export function parseOverlayRect(value: unknown): OverlayRect | null {
  if (!isRecord(value)) return null;
  const rect = {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
  if (!isUnit(rect.x) || !isUnit(rect.y) || !isSpan(rect.width) || !isSpan(rect.height)) return null;
  if (rect.x + rect.width > 1 + 1e-9 || rect.y + rect.height > 1 + 1e-9) return null;
  return {
    x: round4(rect.x),
    y: round4(rect.y),
    width: round4(rect.width),
    height: round4(rect.height),
  };
}

/** Keeps a dragged rectangle inside the canvas and at least `OVERLAY_RECT_MIN` on each side. */
export function clampOverlayRect(rect: OverlayRect): OverlayRect {
  const width = Math.min(1, Math.max(OVERLAY_RECT_MIN, rect.width));
  const height = Math.min(1, Math.max(OVERLAY_RECT_MIN, rect.height));
  const x = Math.min(Math.max(0, rect.x), 1 - width);
  const y = Math.min(Math.max(0, rect.y), 1 - height);
  return {
    x: round4(x),
    y: round4(y),
    width: round4(width),
    height: round4(height),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isSpan(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= OVERLAY_RECT_MIN && value <= 1;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
