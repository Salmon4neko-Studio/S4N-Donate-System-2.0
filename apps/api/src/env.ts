export type RuntimeEnv = "development" | "test" | "production";

export interface ApiEnv {
  env: RuntimeEnv;
  databaseUrl: string;
  masterKey: string;
  dashboardOrigin: string;
  overlayOrigin: string;
  /** Origin ECPay/O'Pay can call, and donors return to. No path. */
  publicBaseUrl: string;
  donationMin: number;
  donationMax: number;
  port: number;
  /** Honor X-Forwarded-* from the edge proxy. Off unless S4N_TRUST_PROXY=1. */
  trustProxy: boolean;
  /** How long non-chat events stay in the log. */
  eventRetentionDays: number;
  /** How long chat events stay in the log. Can be shorter than the default. */
  eventChatRetentionHours: number;
  eventCleanupIntervalMinutes: number;
  /** Matching events sent to one reconnecting client. */
  eventReplayLimit: number;
}

const LOCAL_DATABASE_URL = "postgresql://s4n:s4n_dev_password@localhost:5432/s4n";

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const env = parseRuntime(source.S4N_ENV ?? "development");
  const databaseUrl = source.DATABASE_URL ?? (env === "production" ? "" : LOCAL_DATABASE_URL);
  if (databaseUrl === "") {
    throw new Error("DATABASE_URL is required");
  }

  const masterKey = source.S4N_MASTER_KEY;
  if (masterKey === undefined || masterKey.trim() === "") {
    throw new Error("S4N_MASTER_KEY is required");
  }

  const dashboardOrigin = parseOrigin(source.S4N_DASHBOARD_ORIGIN ?? "http://localhost:5180", "S4N_DASHBOARD_ORIGIN");
  const overlayOrigin = parseOrigin(source.S4N_OVERLAY_ORIGIN ?? "http://localhost:5181", "S4N_OVERLAY_ORIGIN");
  const publicBaseUrl = parsePublicBase(
    source.S4N_PUBLIC_BASE_URL ?? (env === "production" ? "" : "http://127.0.0.1:8787"),
  );
  const donationMin = parseBound(source.S4N_DONATION_MIN_TWD, 30, "S4N_DONATION_MIN_TWD");
  const donationMax = parseBound(source.S4N_DONATION_MAX_TWD, 20_000, "S4N_DONATION_MAX_TWD");
  if (donationMin > donationMax) throw new Error("S4N_DONATION_MIN_TWD is above S4N_DONATION_MAX_TWD");
  const port = Number(source.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT is invalid");
  }
  const trustProxy = parseTrustProxy(source.S4N_TRUST_PROXY);
  const eventRetentionDays = parseBound(source.S4N_EVENT_RETENTION_DAYS, 7, "S4N_EVENT_RETENTION_DAYS", 365);
  const eventChatRetentionHours = parseBound(
    source.S4N_EVENT_CHAT_RETENTION_HOURS,
    24,
    "S4N_EVENT_CHAT_RETENTION_HOURS",
    24 * 365,
  );
  const eventCleanupIntervalMinutes = parseBound(
    source.S4N_EVENT_CLEANUP_INTERVAL_MINUTES,
    15,
    "S4N_EVENT_CLEANUP_INTERVAL_MINUTES",
    24 * 60,
  );
  const eventReplayLimit = parseBound(source.S4N_EVENT_REPLAY_LIMIT, 200, "S4N_EVENT_REPLAY_LIMIT", 2_000);

  return {
    env,
    databaseUrl,
    masterKey,
    dashboardOrigin,
    overlayOrigin,
    publicBaseUrl,
    donationMin,
    donationMax,
    port,
    trustProxy,
    eventRetentionDays,
    eventChatRetentionHours,
    eventCleanupIntervalMinutes,
    eventReplayLimit,
  };
}

function parsePublicBase(value: string): string {
  if (value.trim() === "") throw new Error("S4N_PUBLIC_BASE_URL is required");
  const origin = parseOrigin(value, "S4N_PUBLIC_BASE_URL");
  const url = new URL(value);
  if (url.username !== "" || url.password !== "" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("S4N_PUBLIC_BASE_URL is invalid");
  }
  if (url.search !== "" || url.hash !== "") throw new Error("S4N_PUBLIC_BASE_URL is invalid");
  return origin;
}

function parseBound(value: string | undefined, fallback: number, name: string, max = 10_000_000): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^[1-9][0-9]*$/.test(value.trim())) throw new Error(`${name} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} is invalid`);
  }
  return parsed;
}

function parseOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is invalid`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} is invalid`);
  }
  return url.origin;
}

function parseTrustProxy(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  throw new Error("S4N_TRUST_PROXY is invalid");
}

function parseRuntime(value: string): RuntimeEnv {
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error("S4N_ENV must be development, test, or production");
}
