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
}

export interface SettingsFieldState extends PluginField {
  configured: boolean;
  value?: string | number | boolean;
}

export interface DonationRow {
  id: string;
  providerId: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
  status: "created" | "succeeded" | "failed";
  donorName: string;
  message: string;
  createdAt: string;
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
