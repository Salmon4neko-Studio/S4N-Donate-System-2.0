function apiUrl(path: string): URL {
  const base = import.meta.env.DEV
    ? window.location.origin
    : (import.meta.env.VITE_API_URL ?? "http://localhost:8787");
  return new URL(path, base);
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super("api request failed");
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, null);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export interface HealthResponse {
  service: string;
  status: string;
  database: "up" | "down" | "unconfigured";
  realtime: string;
  eventLog: "memory" | "postgres";
  payments: string[];
}

export interface PluginField {
  key: string;
  title: string | null;
  description: string | null;
  type: string;
  secret: boolean;
  required: boolean;
  enum: string[] | null;
  minimum: number | null;
  multiline: boolean;
  default: string | number | boolean | null;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  description: string | null;
  kind: string[];
  permissions: string[];
  official: boolean;
  enabled: boolean;
  settingsFields: PluginField[];
  /** Enabled plugins with this flag appear under the sidebar 「外掛」 group. */
  settingsNav: boolean;
  category: string | null;
  author: string | null;
  latestVersion: string;
  updateAvailable: boolean;
  pinned: boolean;
  addedPermissions: string[];
  previousVersion: string | null;
  source: string;
}

export interface MarketplaceScreenshot {
  alt: string;
  caption: string;
  frame: "checkout" | "overlay" | "chat" | "tool";
}

export interface MarketplaceListing {
  id: string;
  name: string;
  version: string;
  installedVersion: string | null;
  description: string;
  category: "payment" | "overlay" | "chat-source" | "tool";
  author: string;
  official: boolean;
  featured: boolean;
  icon: string;
  kind: string[];
  permissions: string[];
  addedPermissions: string[];
  changelog: string;
  compatibility: { core: string; pluginSpec: string };
  screenshots: MarketplaceScreenshot[];
  source: "official" | "community";
  installed: boolean;
  enabled: boolean;
  pinned: boolean;
  updateAvailable: boolean;
  previousVersion: string | null;
  installable: boolean;
  blockReason: string | null;
  runtime: "bundled" | "metadata" | "none";
}

export interface MarketplaceResponse {
  checkedAt: string | null;
  verified: boolean;
  plugins: MarketplaceListing[];
}

export interface SettingsFieldState extends PluginField {
  configured: boolean;
  value?: string | number | boolean;
}

export interface PluginSettingsResponse {
  pluginId: string;
  fields: SettingsFieldState[];
  secretFields: SettingsFieldState[];
  publicFields: SettingsFieldState[];
}

export interface DonationRow {
  id: string;
  providerId: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
  status: "created" | "awaiting" | "succeeded" | "expired" | "failed" | "review";
  donorName: string;
  message: string;
  createdAt: string;
  expiresAt: string | null;
  bankCode: string | null;
  payCode: string | null;
  barcodes: readonly [string, string, string] | null;
  reviewNotice: Readonly<Record<string, string>> | null;
}

export interface EventLogEntry {
  sequence: string;
  id: string;
  type: string;
  occurredAt: string;
  summary: string;
}

export interface EventLogResponse {
  head: string;
  retention: { defaultDays: number; chatHours: number };
  eventLog: "memory" | "postgres";
  events: EventLogEntry[];
}

export interface OverlayLink {
  configured: boolean;
  url: string | null;
  pluginId: string;
  chatUrl: string | null;
  chatPluginId: string;
}
