import { randomUUID } from "node:crypto";
import type { SealedSecret } from "../crypto/secret-box.js";

export interface OperatorRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface SessionRecord {
  id: string;
  operatorId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface StoredOverlayToken {
  tokenHash: string;
  sealed: SealedSecret;
}

export interface AuthStore {
  countOperators(): Promise<number>;
  createOperator(input: { id: string; email: string; passwordHash: string }): Promise<OperatorRecord>;
  findOperatorByEmail(email: string): Promise<OperatorRecord | null>;
  findOperatorById(id: string): Promise<OperatorRecord | null>;
  createSession(input: {
    id: string;
    operatorId: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<SessionRecord>;
  findSession(id: string): Promise<{ session: SessionRecord; operator: OperatorRecord } | null>;
  deleteSession(id: string): Promise<void>;
  saveOverlayToken(operatorId: string, token: StoredOverlayToken): Promise<void>;
  findOverlayTokenByHash(tokenHash: string): Promise<{ operatorId: string } | null>;
  readOverlayToken(operatorId: string): Promise<StoredOverlayToken | null>;
}

interface MemoryOperator extends OperatorRecord {
  overlay: StoredOverlayToken | null;
}

export function createMemoryAuthStore(): AuthStore {
  const operators = new Map<string, MemoryOperator>();
  const byEmail = new Map<string, string>();
  const sessions = new Map<string, SessionRecord>();

  return {
    async countOperators() {
      return operators.size;
    },
    async createOperator(input) {
      const email = input.email.toLowerCase();
      if (byEmail.has(email)) throw new Error("email_taken");
      const operator: MemoryOperator = {
        id: input.id || randomUUID(),
        email,
        passwordHash: input.passwordHash,
        overlay: null,
      };
      operators.set(operator.id, operator);
      byEmail.set(email, operator.id);
      return { id: operator.id, email: operator.email, passwordHash: operator.passwordHash };
    },
    async findOperatorByEmail(email) {
      const id = byEmail.get(email.toLowerCase());
      if (id === undefined) return null;
      return publicOperator(operators.get(id));
    },
    async findOperatorById(id) {
      return publicOperator(operators.get(id));
    },
    async createSession(input) {
      const session: SessionRecord = {
        id: input.id,
        operatorId: input.operatorId,
        expiresAt: new Date(input.expiresAt),
        createdAt: new Date(input.createdAt),
      };
      sessions.set(session.id, session);
      return { ...session, expiresAt: new Date(session.expiresAt), createdAt: new Date(session.createdAt) };
    },
    async findSession(id) {
      const session = sessions.get(id);
      if (session === undefined) return null;
      const operator = operators.get(session.operatorId);
      if (operator === undefined) return null;
      return {
        session: {
          ...session,
          expiresAt: new Date(session.expiresAt),
          createdAt: new Date(session.createdAt),
        },
        operator: {
          id: operator.id,
          email: operator.email,
          passwordHash: operator.passwordHash,
        },
      };
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
    async saveOverlayToken(operatorId, token) {
      const operator = operators.get(operatorId);
      if (operator === undefined) throw new Error("missing_operator");
      operator.overlay = {
        tokenHash: token.tokenHash,
        sealed: {
          ciphertext: new Uint8Array(token.sealed.ciphertext),
          iv: new Uint8Array(token.sealed.iv),
          authTag: new Uint8Array(token.sealed.authTag),
        },
      };
    },
    async findOverlayTokenByHash(tokenHash) {
      for (const operator of operators.values()) {
        if (operator.overlay?.tokenHash === tokenHash) return { operatorId: operator.id };
      }
      return null;
    },
    async readOverlayToken(operatorId) {
      const overlay = operators.get(operatorId)?.overlay;
      if (overlay === undefined || overlay === null) return null;
      return {
        tokenHash: overlay.tokenHash,
        sealed: {
          ciphertext: new Uint8Array(overlay.sealed.ciphertext),
          iv: new Uint8Array(overlay.sealed.iv),
          authTag: new Uint8Array(overlay.sealed.authTag),
        },
      };
    },
  };
}

function publicOperator(operator: MemoryOperator | undefined): OperatorRecord | null {
  if (operator === undefined) return null;
  return { id: operator.id, email: operator.email, passwordHash: operator.passwordHash };
}
