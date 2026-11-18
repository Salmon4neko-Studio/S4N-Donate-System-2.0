/**
 * Pure helpers for the dashboard OBS preview.
 * The iframe loads the same overlay URL OBS uses. The token stays in that
 * query string and is not copied into a hash, log line, or second parameter.
 * allow-same-origin keeps the overlay's real origin so its modules and
 * WebSocket are not an opaque null origin. The dashboard is a different
 * origin, and the sandbox does not allow navigation, popups, or forms.
 */

export const ALERTS_PLUGIN_ID = "official.alerts";
export const CHAT_OVERLAY_PLUGIN_ID = "official.chat-overlay";

const SCENE_PLUGIN_IDS = new Set([ALERTS_PLUGIN_ID, CHAT_OVERLAY_PLUGIN_ID]);
export const COMBINED_PREVIEW_ID = "combined";
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

const PLUGIN_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const BLOB_URL = /^blob:https?:\/\/[a-z0-9.\-:[\]]+\/[a-z0-9-]+$/i;

export interface OverlayPluginRef {
  id: string;
  name: string;
  kind: readonly string[];
  enabled: boolean;
}

export interface PreviewChoice {
  id: string;
  label: string;
  pluginIds: readonly string[];
}

export type StageBackground = "dark" | "light" | "green" | "sample" | "upload";

export type StageBackgroundAttr = {
  bg: "dark" | "light" | "green" | "image";
  image: string | null;
};

export function isPluginId(value: string): boolean {
  return PLUGIN_ID.test(value);
}

export function overlayPreviewSrc(pageUrl: string, pluginId: string): string | null {
  if (!isPluginId(pluginId)) return null;
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
  url.searchParams.set("plugin", pluginId);
  url.searchParams.set("transparent", "1");
  url.searchParams.delete("preview");
  url.hash = "";
  return url.toString();
}

export function previewChoices(
  plugins: readonly OverlayPluginRef[] | null,
  urlPluginId: string,
): PreviewChoice[] {
  if (!isPluginId(urlPluginId)) return [];
  if (plugins === null) {
    return [{ id: urlPluginId, label: "這條網址", pluginIds: [urlPluginId] }];
  }

  const overlays = plugins.filter((plugin) => plugin.kind.includes("overlay") && isPluginId(plugin.id));
  const enabled = overlays.filter((plugin) => plugin.enabled);
  const individuals: PreviewChoice[] = [];
  const urlPlugin = overlays.find((plugin) => plugin.id === urlPluginId);

  if (urlPlugin !== undefined) {
    individuals.push({
      id: urlPlugin.id,
      label: urlPlugin.name.trim() || urlPlugin.id,
      pluginIds: [urlPlugin.id],
    });
  } else {
    individuals.push({ id: urlPluginId, label: "這條網址", pluginIds: [urlPluginId] });
  }

  for (const plugin of enabled) {
    if (individuals.some((item) => item.id === plugin.id)) continue;
    individuals.push({
      id: plugin.id,
      label: plugin.name.trim() || plugin.id,
      pluginIds: [plugin.id],
    });
  }

  if (enabled.length <= 1) return individuals;

  const stacked = enabled.map((plugin) => plugin.id);
  const urlIndex = stacked.indexOf(urlPluginId);
  if (urlIndex > -1 && urlIndex < stacked.length - 1) {
    const [id] = stacked.splice(urlIndex, 1);
    if (id !== undefined) stacked.push(id);
  }

  return [{ id: COMBINED_PREVIEW_ID, label: "全部疊加", pluginIds: stacked }, ...individuals];
}

export function defaultPreviewChoiceId(choices: readonly PreviewChoice[], urlPluginId: string): string {
  if (choices.some((choice) => choice.id === urlPluginId)) return urlPluginId;
  return choices[0]?.id ?? urlPluginId;
}

export function choiceNeedsSceneNote(choice: PreviewChoice | null): boolean {
  if (choice === null || choice.pluginIds.length === 0) return false;
  return choice.pluginIds.every((id) => !SCENE_PLUGIN_IDS.has(id));
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
