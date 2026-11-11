import type { Hono } from "hono";
import { originGuard } from "./origin.js";
import { rateLimit } from "./rate-limit.js";
import { clearSessionCookie, writeSessionCookie } from "./cookie.js";
import { parseCredentials } from "./credentials.js";
import type { AuthService } from "./service.js";
import { requireSession, type SessionEnv } from "./session.js";
import { clientKey, readJson } from "../http.js";
import { LOGIN_RATE_LIMIT, SETUP_RATE_LIMIT } from "./constants.js";

export function registerAuthRoutes(
  app: Hono<SessionEnv>,
  options: {
    auth: AuthService;
    allowedOrigins: ReadonlySet<string>;
    secureCookie: boolean;
    loginRateLimit?: { windowMs: number; max: number };
    setupRateLimit?: { windowMs: number; max: number };
  },
): void {
  const guard = originGuard(options.allowedOrigins);
  const session = requireSession(options.auth, {
    secure: options.secureCookie,
    rotateAfterMs: options.auth.rotateAfterMs,
  });
  const loginLimit = options.loginRateLimit ?? LOGIN_RATE_LIMIT;
  const setupLimit = options.setupRateLimit ?? SETUP_RATE_LIMIT;

  app.get("/api/auth/status", async (c) => {
    c.header("cache-control", "no-store");
    try {
      return c.json({ needsSetup: await options.auth.needsSetup() });
    } catch {
      return c.json({ error: "auth_unavailable" }, 503);
    }
  });

  app.post(
    "/api/auth/setup",
    guard,
    rateLimit({
      windowMs: setupLimit.windowMs,
      max: setupLimit.max,
      key: (c) => `setup:${clientKey(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      c.header("cache-control", "no-store");
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: "invalid_json" }, 422);
      const parsed = parseCredentials(body.value);
      if (!parsed.ok) return c.json({ error: "invalid_credentials", issues: parsed.issues }, 422);
      const result = await options.auth.setup(parsed.value);
      if (!result.ok) {
        const status = result.error === "setup_closed" ? 409 : 503;
        return c.json({ error: result.error }, status);
      }
      writeSessionCookie(c, result.sessionId, { secure: options.secureCookie, expiresAt: result.expiresAt });
      return c.json({ email: result.email }, 201);
    },
  );

  app.post(
    "/api/auth/login",
    guard,
    rateLimit({
      windowMs: loginLimit.windowMs,
      max: loginLimit.max,
      key: (c) => `login:${clientKey(c.req.header("x-forwarded-for"))}`,
    }),
    async (c) => {
      c.header("cache-control", "no-store");
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: "invalid_json" }, 422);
      const parsed = parseCredentials(body.value);
      if (!parsed.ok) return c.json({ error: "invalid_credentials", issues: parsed.issues }, 422);
      const result = await options.auth.login(parsed.value);
      if (!result.ok) {
        const status = result.error === "invalid_credentials" ? 401 : 503;
        return c.json({ error: result.error }, status);
      }
      writeSessionCookie(c, result.sessionId, { secure: options.secureCookie, expiresAt: result.expiresAt });
      return c.json({ email: result.email });
    },
  );

  app.post("/api/auth/logout", session, guard, async (c) => {
    await options.auth.logout(c.get("sessionId"));
    clearSessionCookie(c, options.secureCookie);
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", session, (c) => {
    return c.json({ email: c.get("email") });
  });
}
