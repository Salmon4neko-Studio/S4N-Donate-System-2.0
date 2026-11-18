import type { Permission, PluginKind } from "@s4n/plugin-sdk";

export const REGISTRY_FORMAT = "s4n-registry-index";
export const REGISTRY_VERSION = 1;

export const MARKETPLACE_CATEGORIES = ["payment", "overlay", "chat-source", "tool"] as const;
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const PLUGIN_ICONS = [
  "credit-card",
  "bell",
  "display",
  "comments",
  "wrench",
  "bullseye",
  "microphone",
  "scroll",
] as const;
export type PluginIcon = (typeof PLUGIN_ICONS)[number];

export const SCREEN_FRAMES = ["checkout", "overlay", "chat", "tool"] as const;
export type ScreenFrame = (typeof SCREEN_FRAMES)[number];

export interface RegistryScreenshot {
  alt: string;
  caption: string;
  frame: ScreenFrame;
}

export interface RegistryCompatibility {
  core: "0.1";
  pluginSpec: "0.1";
}

export interface RegistryPlugin {
  id: string;
  name: string;
  version: string;
  api: "0.1";
  category: MarketplaceCategory;
  author: string;
  official: boolean;
  description: string;
  icon: PluginIcon;
  permissions: Permission[];
  kind: PluginKind[];
  changelog: string;
  compatibility: RegistryCompatibility;
  sha256: string;
  featured: boolean;
  screenshots: RegistryScreenshot[];
}

export interface RegistryIndex {
  format: typeof REGISTRY_FORMAT;
  version: typeof REGISTRY_VERSION;
  issuedAt: string;
  plugins: RegistryPlugin[];
}

export type RegistrySourceId = "official" | "community";

export interface RegistrySource {
  readonly id: RegistrySourceId;
  read(): Promise<Uint8Array | null>;
}

export type InstallRuntime = "bundled" | "metadata";

export interface MarketplaceScreenshot {
  alt: string;
  caption: string;
  frame: ScreenFrame;
}

export interface MarketplaceListing {
  id: string;
  name: string;
  version: string;
  installedVersion: string | null;
  description: string;
  category: MarketplaceCategory;
  author: string;
  official: boolean;
  featured: boolean;
  icon: PluginIcon;
  kind: string[];
  permissions: string[];
  addedPermissions: string[];
  changelog: string;
  compatibility: { core: string; pluginSpec: string };
  screenshots: MarketplaceScreenshot[];
  source: RegistrySourceId;
  installed: boolean;
  enabled: boolean;
  pinned: boolean;
  updateAvailable: boolean;
  previousVersion: string | null;
  installable: boolean;
  blockReason: string | null;
  runtime: InstallRuntime | "none";
}
