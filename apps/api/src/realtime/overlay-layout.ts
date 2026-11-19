import { parseOverlayRect, type OverlayRect } from "@s4n/plugin-sdk";
import type { LoadedPlugin } from "../plugins/catalog.js";

export const CANVAS_MIN = 160;
export const CANVAS_MAX = 4096;
export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;

export interface StoredLayout {
  width: number;
  height: number;
  slots: Record<string, OverlayRect>;
}

export interface PresentedSlot {
  pluginId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayLayoutStore {
  read(operatorId: string): Promise<StoredLayout | null>;
  write(operatorId: string, layout: StoredLayout): Promise<void>;
}

export function createMemoryOverlayLayoutStore(): OverlayLayoutStore {
  const rows = new Map<string, StoredLayout>();
  return {
    async read(operatorId) {
      const row = rows.get(operatorId);
      if (row === undefined) return null;
      return { width: row.width, height: row.height, slots: { ...row.slots } };
    },
    async write(operatorId, layout) {
      rows.set(operatorId, {
        width: layout.width,
        height: layout.height,
        slots: { ...layout.slots },
      });
    },
  };
}

export function canvasPlugins(catalog: readonly LoadedPlugin[]): Array<{
  id: string;
  name: string;
  overlaySlot: OverlayRect;
}> {
  const plugins: Array<{ id: string; name: string; overlaySlot: OverlayRect }> = [];
  for (const plugin of catalog) {
    const slot = plugin.manifest.overlaySlot;
    if (slot === undefined) continue;
    plugins.push({ id: plugin.manifest.id, name: plugin.manifest.name, overlaySlot: slot });
  }
  return plugins;
}

/**
 * Enabled plugins that declare `overlaySlot`. A saved rectangle wins.
 * Anything missing or invalid uses the manifest default.
 * Positions are ratios, so changing the canvas size does not rewrite them.
 */
export function presentSlots(
  plugins: readonly { id: string; name: string; overlaySlot: OverlayRect }[],
  enabled: ReadonlySet<string>,
  stored: Readonly<Record<string, OverlayRect>>,
): PresentedSlot[] {
  const slots: PresentedSlot[] = [];
  for (const plugin of plugins) {
    if (!enabled.has(plugin.id)) continue;
    const saved = parseOverlayRect(stored[plugin.id]);
    const rect = saved ?? plugin.overlaySlot;
    slots.push({ pluginId: plugin.id, name: plugin.name, ...rect });
  }
  return slots;
}

export function viewLayout(
  stored: StoredLayout | null,
  plugins: readonly { id: string; name: string; overlaySlot: OverlayRect }[],
  enabled: ReadonlySet<string>,
): { canvas: { width: number; height: number }; slots: PresentedSlot[] } {
  return {
    canvas: {
      width: stored?.width ?? DEFAULT_CANVAS_WIDTH,
      height: stored?.height ?? DEFAULT_CANVAS_HEIGHT,
    },
    slots: presentSlots(plugins, enabled, stored?.slots ?? {}),
  };
}

export function readLayoutUpdate(
  value: unknown,
  allowed: ReadonlySet<string>,
): { width: number; height: number; slots: Record<string, OverlayRect> } | null {
  if (!isRecord(value) || !isRecord(value.slots)) return null;
  if (!isCanvasDimension(value.width) || !isCanvasDimension(value.height)) return null;
  const slots: Record<string, OverlayRect> = {};
  for (const [id, raw] of Object.entries(value.slots)) {
    if (!allowed.has(id)) return null;
    const rect = parseOverlayRect(raw);
    if (rect === null) return null;
    slots[id] = rect;
  }
  return { width: value.width, height: value.height, slots };
}

/** Incoming slots replace the same plugin ids. Other allowed slots stay, so a disabled plugin keeps its place. */
export function mergeLayout(
  previous: StoredLayout | null,
  update: { width: number; height: number; slots: Record<string, OverlayRect> },
  allowed: ReadonlySet<string>,
): StoredLayout {
  const slots: Record<string, OverlayRect> = {};
  for (const [id, rect] of Object.entries(previous?.slots ?? {})) {
    if (allowed.has(id) && parseOverlayRect(rect) !== null) slots[id] = rect;
  }
  for (const [id, rect] of Object.entries(update.slots)) slots[id] = rect;
  return { width: update.width, height: update.height, slots };
}

function isCanvasDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= CANVAS_MIN && value <= CANVAS_MAX;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
