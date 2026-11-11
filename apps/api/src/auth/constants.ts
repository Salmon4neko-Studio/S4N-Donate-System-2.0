/**
 * Session cookie. The value is the server-side Session id.
 * Secure is enabled only when S4N_ENV=production; local HTTP development
 * cannot store a Secure cookie. CSRF for cookie mutations is the Origin
 * allowlist, checked on state-changing dashboard routes.
 * Provider callbacks are not browser requests and do not use this cookie.
 */
export const SESSION_COOKIE = {
  name: "s4n_session",
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
} as const;

/** Absolute lifetime from login. Rotation does not extend it. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Issue a new session id after this age so a stolen cookie has a shorter life. */
export const SESSION_ROTATE_AFTER_MS = 15 * 60 * 1000;

export const LOGIN_RATE_LIMIT = {
  windowMs: 60_000,
  max: 5,
} as const;

export const SETUP_RATE_LIMIT = {
  windowMs: 10 * 60_000,
  max: 5,
} as const;

/**
 * OWASP minimum Argon2id parameters. hash-wasm applies these exactly.
 * memoryKiB is the memorySize argument, timeCost is iterations.
 */
export const PASSWORD_HASH = {
  algorithm: "argon2id",
  memoryKiB: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 200,
} as const;
