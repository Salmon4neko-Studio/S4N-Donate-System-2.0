import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function originAllowlist(primary: string): Set<string> {
  const allowed = new Set<string>([primary]);
  try {
    const url = new URL(primary);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      allowed.add(url.origin);
    } else if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      allowed.add(url.origin);
    }
  } catch {
    // Keep the raw primary. Callers that need a URL already failed closed elsewhere.
  }
  return allowed;
}

/** Rejects cross-site mutations. Safe methods pass through. */
export function originGuard(allowed: ReadonlySet<string>): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method.toUpperCase())) {
      return next();
    }
    const origin = c.req.header("origin");
    if (origin === undefined || !allowed.has(origin)) {
      return c.json({ error: "origin_rejected" }, 403);
    }
    return next();
  };
}
