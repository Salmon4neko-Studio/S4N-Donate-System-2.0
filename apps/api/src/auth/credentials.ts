import { PASSWORD_POLICY } from "./constants.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Credentials {
  email: string;
  password: string;
}

export function parseCredentials(
  value: unknown,
): { ok: true; value: Credentials } | { ok: false; issues: string[] } {
  if (!isRecord(value)) return { ok: false, issues: ["invalid_body"] };
  const issues: string[] = [];
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  if (email.length < 3 || email.length > 254 || !EMAIL.test(email)) issues.push("email_invalid");

  const password = typeof value.password === "string" ? value.password : "";
  if (password.length < PASSWORD_POLICY.minLength) issues.push("password_too_short");
  if (password.length > PASSWORD_POLICY.maxLength) issues.push("password_too_long");

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { email, password } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
