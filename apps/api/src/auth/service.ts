import { createHash, randomBytes, randomUUID } from "node:crypto";
import { openSecret, sealSecret, type SealedSecret } from "../crypto/secret-box.js";
import { SESSION_ROTATE_AFTER_MS, SESSION_TTL_MS } from "./constants.js";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password.js";
import type { AuthStore, SessionRecord } from "./store.js";

export interface AuthSuccess {
  ok: true;
  email: string;
  sessionId: string;
  expiresAt: Date;
}

export interface AuthService {
  needsSetup(): Promise<boolean>;
  setup(input: { email: string; password: string }): Promise<AuthSuccess | { ok: false; error: "setup_closed" | "unavailable" }>;
  login(input: { email: string; password: string }): Promise<AuthSuccess | { ok: false; error: "invalid_credentials" | "unavailable" }>;
  logout(sessionId: string): Promise<void>;
  authenticate(sessionId: string | undefined): Promise<{ operatorId: string; email: string; session: SessionRecord } | null>;
  rotate(session: SessionRecord): Promise<{ sessionId: string; expiresAt: Date } | null>;
  issueOverlayToken(operatorId: string): Promise<string>;
  readOverlayToken(operatorId: string): Promise<string | null>;
  overlayTokenValid(token: string): Promise<boolean>;
  /** Operator that owns this overlay token, or null when the token is not current. */
  overlayOperatorId(token: string): Promise<string | null>;
  readonly rotateAfterMs: number;
}

export function createAuthService(options: {
  store: AuthStore;
  masterKey: Buffer;
  ttlMs?: number;
  rotateAfterMs?: number;
}): AuthService {
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const rotateAfterMs = options.rotateAfterMs ?? SESSION_ROTATE_AFTER_MS;
  let tail: Promise<unknown> = Promise.resolve();

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function createSession(operatorId: string, expiresAt = new Date(Date.now() + ttlMs)): Promise<SessionRecord> {
    return options.store.createSession({
      id: randomBytes(32).toString("base64url"),
      operatorId,
      expiresAt,
      createdAt: new Date(),
    });
  }

  return {
    rotateAfterMs,
    async needsSetup() {
      return (await options.store.countOperators()) === 0;
    },
    setup(input) {
      return exclusive(async () => {
        try {
          if ((await options.store.countOperators()) > 0) return { ok: false, error: "setup_closed" as const };
          const passwordHash = await hashPassword(input.password);
          const operator = await options.store.createOperator({
            id: randomUUID(),
            email: input.email,
            passwordHash,
          });
          const session = await createSession(operator.id);
          return { ok: true as const, email: operator.email, sessionId: session.id, expiresAt: session.expiresAt };
        } catch {
          return { ok: false as const, error: "unavailable" as const };
        }
      });
    },
    async login(input) {
      try {
        const operator = await options.store.findOperatorByEmail(input.email);
        const hash = operator?.passwordHash ?? (await dummyPasswordHash());
        const matches = await verifyPassword(input.password, hash);
        if (operator === null || !matches) return { ok: false, error: "invalid_credentials" };
        const session = await createSession(operator.id);
        return { ok: true, email: operator.email, sessionId: session.id, expiresAt: session.expiresAt };
      } catch {
        return { ok: false, error: "unavailable" };
      }
    },
    async logout(sessionId) {
      await options.store.deleteSession(sessionId);
    },
    async authenticate(sessionId) {
      if (sessionId === undefined || sessionId.length < 20) return null;
      const found = await options.store.findSession(sessionId);
      if (found === null) return null;
      if (found.session.expiresAt.getTime() <= Date.now()) {
        await options.store.deleteSession(sessionId);
        return null;
      }
      return {
        operatorId: found.operator.id,
        email: found.operator.email,
        session: found.session,
      };
    },
    async rotate(session) {
      if (session.expiresAt.getTime() <= Date.now()) {
        await options.store.deleteSession(session.id);
        return null;
      }
      const next = await createSession(session.operatorId, session.expiresAt);
      await options.store.deleteSession(session.id);
      return { sessionId: next.id, expiresAt: next.expiresAt };
    },
    async issueOverlayToken(operatorId) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashOverlayToken(token);
      const sealed = sealSecret(token, options.masterKey, overlayTokenAad(operatorId));
      await options.store.saveOverlayToken(operatorId, { tokenHash, sealed });
      return token;
    },
    async readOverlayToken(operatorId) {
      const stored = await options.store.readOverlayToken(operatorId);
      if (stored === null) return null;
      return openSecret(stored.sealed, options.masterKey, overlayTokenAad(operatorId));
    },
    async overlayTokenValid(token) {
      if (token.length < 32 || token.length > 128) return false;
      const found = await options.store.findOverlayTokenByHash(hashOverlayToken(token));
      return found !== null;
    },
    async overlayOperatorId(token) {
      if (token.length < 32 || token.length > 128) return null;
      const found = await options.store.findOverlayTokenByHash(hashOverlayToken(token));
      return found?.operatorId ?? null;
    },
  };
}

export function hashOverlayToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function overlayTokenAad(operatorId: string): string {
  return `s4n.overlay-token:${operatorId}`;
}

export function sealOverlayToken(token: string, operatorId: string, masterKey: Buffer): SealedSecret {
  return sealSecret(token, masterKey, overlayTokenAad(operatorId));
}
