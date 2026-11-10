const base = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8787";

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
    response = await fetch(new URL(path, base), {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
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
  payments: string[];
}

export interface PluginField {
  key: string;
  title: string | null;
  type: string;
  secret: boolean;
  required: boolean;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  description: string | null;
  kind: string[];
  permissions: string[];
  official: boolean;
  activation: "not_implemented";
  settingsFields: PluginField[];
}
