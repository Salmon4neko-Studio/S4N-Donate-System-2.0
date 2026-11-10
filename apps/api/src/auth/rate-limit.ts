import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: (c: Context) => string;
}

/**
 * Single-process fixed window. This is a skeleton limiter, not a shared store,
 * so it does not survive multiple API instances.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  return async (c, next) => {
    const now = Date.now();
    const key = options.key(c);
    const current = buckets.get(key);
    if (current === undefined || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    if (current.count >= options.max) {
      return c.json({ error: "rate_limited" }, 429);
    }
    current.count += 1;
    return next();
  };
}
