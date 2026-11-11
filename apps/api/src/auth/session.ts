import type { MiddlewareHandler } from "hono";
import { clearSessionCookie, readSessionId, writeSessionCookie } from "./cookie.js";
import type { AuthService } from "./service.js";

export type SessionEnv = {
  Variables: {
    operatorId: string;
    email: string;
    sessionId: string;
  };
};

export function requireSession(
  auth: AuthService,
  options: { secure: boolean; rotateAfterMs: number },
): MiddlewareHandler<SessionEnv> {
  const rotating = new Set<string>();
  return async (c, next) => {
    c.header("cache-control", "no-store");
    let found: Awaited<ReturnType<AuthService["authenticate"]>>;
    try {
      found = await auth.authenticate(readSessionId(c));
    } catch {
      return c.json({ error: "auth_unavailable" }, 503);
    }
    if (found === null) return c.json({ error: "session_required" }, 401);

    let sessionId = found.session.id;
    const age = Date.now() - found.session.createdAt.getTime();
    if (age >= options.rotateAfterMs && !rotating.has(found.session.id)) {
      rotating.add(found.session.id);
      try {
        const rotated = await auth.rotate(found.session);
        if (rotated === null) return c.json({ error: "session_required" }, 401);
        sessionId = rotated.sessionId;
        writeSessionCookie(c, rotated.sessionId, { secure: options.secure, expiresAt: rotated.expiresAt });
      } catch {
        return c.json({ error: "auth_unavailable" }, 503);
      } finally {
        rotating.delete(found.session.id);
      }
    }

    c.set("operatorId", found.operatorId);
    c.set("email", found.email);
    c.set("sessionId", sessionId);
    await next();
  };
}

export function sessionCookieSecure(envName: string): boolean {
  return envName === "production";
}

export { clearSessionCookie, writeSessionCookie };
