export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Last comma-separated hop. Caddy overwrites X-Forwarded-* with one value. */
export function forwardedHop(header: string | null | undefined): string | undefined {
  if (header === undefined || header === null) return undefined;
  const hops = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return hops.at(-1);
}

const FORWARDED_HOST = /^[A-Za-z0-9._-]+(?::[0-9]{1,5})?$/;

function splitForwardedHost(host: string): { hostname: string; port: string } | null {
  if (!FORWARDED_HOST.test(host)) return null;
  const colon = host.lastIndexOf(":");
  if (colon === -1) return { hostname: host, port: "" };
  return { hostname: host.slice(0, colon), port: host.slice(colon + 1) };
}

/**
 * Rate-limit identity. Direct clients keep the raw header.
 * Behind the edge proxy, only the last hop counts, so a spoofed prefix cannot mint a new bucket.
 * That last hop must already be the visitor. A second proxy that appends itself would make every
 * login share the proxy address. The Coolify Caddyfile writes a single client IP instead.
 */
export function clientKey(header: string | undefined, trustProxy = false): string {
  if (!trustProxy) return header ?? "local";
  return forwardedHop(header) ?? "local";
}

/** One log line for a proxied request. Absent when the edge did not send a client address. */
export function clientAccessLine(request: Request): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor === null || forwardedFor.trim() === "") return undefined;
  let pathname = "/";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = "/";
  }
  const proto = forwardedHop(request.headers.get("x-forwarded-proto")) ?? "-";
  const line = `client ${clientKey(forwardedFor, true)} proto ${proto} ${request.method} ${pathname}`;
  return line.replace(/[\r\n]/g, "");
}

/**
 * Rebuild the request URL from the edge proxy's scheme and host.
 * The API itself only speaks HTTP to Caddy. Public callbacks still come from S4N_PUBLIC_BASE_URL.
 */
export function forwardedRequest(request: Request): Request {
  const proto = forwardedHop(request.headers.get("x-forwarded-proto"))?.toLowerCase();
  if (proto !== "http" && proto !== "https") return request;
  const host = forwardedHop(request.headers.get("x-forwarded-host")) ?? request.headers.get("host") ?? "";
  if (!FORWARDED_HOST.test(host)) return request;
  let next: URL;
  try {
    next = new URL(request.url);
  } catch {
    return request;
  }
  const split = splitForwardedHost(host);
  if (split === null) return request;
  if (next.protocol === `${proto}:` && next.hostname === split.hostname && next.port === split.port) return request;
  next.protocol = `${proto}:`;
  next.hostname = split.hostname;
  next.port = split.port;
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(next, init);
}
