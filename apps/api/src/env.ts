export type RuntimeEnv = "development" | "test" | "production";

export interface ApiEnv {
  env: RuntimeEnv;
  databaseUrl: string;
  masterKey: string;
  dashboardOrigin: string;
  overlayOrigin: string;
  port: number;
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
  const port = Number(source.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT is invalid");
  }

  return { env, databaseUrl, masterKey, dashboardOrigin, overlayOrigin, port };
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

function parseRuntime(value: string): RuntimeEnv {
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error("S4N_ENV must be development, test, or production");
}
