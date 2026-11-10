/**
 * Placeholder for the later session design. No login route is mounted.
 *
 * Cookie: httpOnly, Secure, SameSite=Lax, Path=/. The value is the Session id,
 * not a token the browser can read. CSRF for cookie mutations is the Origin
 * allowlist in origin.ts, checked on state-changing dashboard routes.
 * Provider callbacks are not browser requests and do not use this check;
 * they are authenticated by the payment plugin's signature verification.
 *
 * Passwords, when login exists, must be hashed with Argon2id using the
 * parameters below. This skeleton does not hash passwords and does not
 * depend on the native argon2 module yet.
 */
export const SESSION_COOKIE = {
  name: "s4n_session",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export const PASSWORD_HASH = {
  algorithm: "argon2id",
  memoryKiB: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
