import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE } from "./constants.js";

export function readSessionId(c: Context): string | undefined {
  const value = getCookie(c, SESSION_COOKIE.name);
  if (value === undefined || value.length === 0) return undefined;
  return value;
}

export function writeSessionCookie(
  c: Context,
  sessionId: string,
  options: { secure: boolean; expiresAt: Date },
): void {
  const maxAge = Math.max(1, Math.floor((options.expiresAt.getTime() - Date.now()) / 1000));
  setCookie(c, SESSION_COOKIE.name, sessionId, {
    httpOnly: true,
    secure: options.secure,
    sameSite: "Lax",
    path: SESSION_COOKIE.path,
    maxAge,
  });
}

export function clearSessionCookie(c: Context, secure: boolean): void {
  setCookie(c, SESSION_COOKIE.name, "", {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: SESSION_COOKIE.path,
    maxAge: 0,
  });
}
