import { PERMISSIONS, PLUGIN_KINDS, type Permission, type PluginKind } from "s4n-donate-system-2.0-plugin-sdk";
import {
  MARKETPLACE_CATEGORIES,
  PLUGIN_ICONS,
  REGISTRY_FORMAT,
  REGISTRY_VERSION,
  SCREEN_FRAMES,
  type MarketplaceCategory,
  type PluginIcon,
  type RegistryIndex,
  type RegistryPlugin,
  type RegistryScreenshot,
  type ScreenFrame,
} from "./types.js";

const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PLUGIN_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;

export class RegistryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryParseError";
  }
}

export function parseRegistryIndex(value: unknown): RegistryIndex {
  const record = object(value, "index");
  assertKeys(record, ["format", "version", "issuedAt", "plugins"], "index");
  if (record.format !== REGISTRY_FORMAT) throw new RegistryParseError("format");
  if (record.version !== REGISTRY_VERSION) throw new RegistryParseError("version");
  const issuedAt = text(record.issuedAt, 32, "issuedAt");
  if (Number.isNaN(Date.parse(issuedAt))) throw new RegistryParseError("issuedAt");
  if (!Array.isArray(record.plugins) || record.plugins.length > 32) {
    throw new RegistryParseError("plugins");
  }
  const seen = new Set<string>();
  const plugins = record.plugins.map((item) => {
    const plugin = parsePlugin(item);
    if (seen.has(plugin.id)) throw new RegistryParseError("duplicate plugin");
    seen.add(plugin.id);
    return plugin;
  });
  return { format: REGISTRY_FORMAT, version: REGISTRY_VERSION, issuedAt, plugins };
}

function parsePlugin(value: unknown): RegistryPlugin {
  const record = object(value, "plugin");
  assertKeys(
    record,
    [
      "id",
      "name",
      "version",
      "api",
      "category",
      "author",
      "official",
      "description",
      "icon",
      "permissions",
      "kind",
      "changelog",
      "compatibility",
      "sha256",
      "featured",
      "screenshots",
    ],
    "plugin",
  );
  const id = text(record.id, 80, "id");
  if (!PLUGIN_ID.test(id)) throw new RegistryParseError("id");
  const version = text(record.version, 32, "version");
  if (!SEMVER.test(version)) throw new RegistryParseError("version");
  if (record.api !== "0.1") throw new RegistryParseError("api");
  if (!includes(MARKETPLACE_CATEGORIES, record.category)) throw new RegistryParseError("category");
  if (typeof record.official !== "boolean" || typeof record.featured !== "boolean") {
    throw new RegistryParseError("flags");
  }
  const sha256 = text(record.sha256, 64, "sha256");
  if (!SHA256.test(sha256)) throw new RegistryParseError("sha256");
  if (!includes(PLUGIN_ICONS, record.icon)) throw new RegistryParseError("icon");
  const permissions = stringList(record.permissions, 12, "permissions").map((item) => {
    if (!includes(PERMISSIONS, item)) throw new RegistryParseError("permissions");
    return item;
  });
  if (new Set(permissions).size !== permissions.length) throw new RegistryParseError("permissions");
  const kind = stringList(record.kind, 5, "kind").map((item) => {
    if (!includes(PLUGIN_KINDS, item)) throw new RegistryParseError("kind");
    return item;
  });
  if (kind.length === 0) throw new RegistryParseError("kind");
  const compatibility = object(record.compatibility, "compatibility");
  assertKeys(compatibility, ["core", "pluginSpec"], "compatibility");
  if (compatibility.core !== "0.1" || compatibility.pluginSpec !== "0.1") {
    throw new RegistryParseError("compatibility");
  }
  const screenshots = parseScreenshots(record.screenshots);
  return {
    id,
    name: text(record.name, 80, "name"),
    version,
    api: "0.1",
    category: record.category,
    author: text(record.author, 80, "author"),
    official: record.official,
    description: text(record.description, 400, "description"),
    icon: record.icon,
    permissions,
    kind,
    changelog: text(record.changelog, 2000, "changelog"),
    compatibility: { core: "0.1", pluginSpec: "0.1" },
    sha256,
    featured: record.featured,
    screenshots,
  };
}

function parseScreenshots(value: unknown): RegistryScreenshot[] {
  if (!Array.isArray(value) || value.length > 4) throw new RegistryParseError("screenshots");
  return value.map((item) => {
    const record = object(item, "screenshot");
    assertKeys(record, ["alt", "caption", "frame"], "screenshot");
    if (!includes(SCREEN_FRAMES, record.frame)) throw new RegistryParseError("frame");
    return {
      alt: text(record.alt, 120, "alt"),
      caption: text(record.caption, 200, "caption"),
      frame: record.frame,
    };
  });
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryParseError(label);
  }
  return value as Record<string, unknown>;
}

function assertKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const expected = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) throw new RegistryParseError(`${label} field ${key}`);
  }
  for (const key of allowed) {
    if (!(key in record)) throw new RegistryParseError(`${label} missing ${key}`);
  }
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new RegistryParseError(label);
  }
  return value;
}

function stringList(value: unknown, max: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > max) throw new RegistryParseError(label);
  return value.map((item) => {
    if (typeof item !== "string" || item.length === 0 || item.length > 80) {
      throw new RegistryParseError(label);
    }
    return item;
  });
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export type { MarketplaceCategory, Permission, PluginIcon, PluginKind, ScreenFrame };
