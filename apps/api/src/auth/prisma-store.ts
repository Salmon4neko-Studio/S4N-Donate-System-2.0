import type { PrismaClient } from "../../generated/prisma/client.js";
import type { SealedSecret } from "../crypto/secret-box.js";
import type { AuthStore, StoredOverlayToken } from "./store.js";

export function createPrismaAuthStore(prisma: PrismaClient): AuthStore {
  return {
    async countOperators() {
      return prisma.operator.count();
    },
    async createOperator(input) {
      const row = await prisma.operator.create({
        data: {
          id: input.id,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
        },
      });
      return { id: row.id, email: row.email, passwordHash: row.passwordHash };
    },
    async findOperatorByEmail(email) {
      const row = await prisma.operator.findUnique({ where: { email: email.toLowerCase() } });
      if (row === null) return null;
      return { id: row.id, email: row.email, passwordHash: row.passwordHash };
    },
    async findOperatorById(id) {
      const row = await prisma.operator.findUnique({ where: { id } });
      if (row === null) return null;
      return { id: row.id, email: row.email, passwordHash: row.passwordHash };
    },
    async createSession(input) {
      const row = await prisma.session.create({
        data: {
          id: input.id,
          operatorId: input.operatorId,
          expiresAt: input.expiresAt,
          createdAt: input.createdAt,
        },
      });
      return {
        id: row.id,
        operatorId: row.operatorId,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      };
    },
    async findSession(id) {
      const row = await prisma.session.findUnique({ where: { id }, include: { operator: true } });
      if (row === null) return null;
      return {
        session: {
          id: row.id,
          operatorId: row.operatorId,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
        },
        operator: {
          id: row.operator.id,
          email: row.operator.email,
          passwordHash: row.operator.passwordHash,
        },
      };
    },
    async deleteSession(id) {
      await prisma.session.deleteMany({ where: { id } });
    },
    async saveOverlayToken(operatorId, token) {
      await prisma.operator.update({
        where: { id: operatorId },
        data: {
          overlayTokenHash: token.tokenHash,
          overlayCiphertext: Buffer.from(token.sealed.ciphertext),
          overlayIv: Buffer.from(token.sealed.iv),
          overlayAuthTag: Buffer.from(token.sealed.authTag),
        },
      });
    },
    async findOverlayTokenByHash(tokenHash) {
      const row = await prisma.operator.findUnique({
        where: { overlayTokenHash: tokenHash },
        select: { id: true },
      });
      return row === null ? null : { operatorId: row.id };
    },
    async readOverlayToken(operatorId) {
      const row = await prisma.operator.findUnique({
        where: { id: operatorId },
        select: {
          overlayTokenHash: true,
          overlayCiphertext: true,
          overlayIv: true,
          overlayAuthTag: true,
        },
      });
      if (
        row === null ||
        row.overlayTokenHash === null ||
        row.overlayCiphertext === null ||
        row.overlayIv === null ||
        row.overlayAuthTag === null
      ) {
        return null;
      }
      const token: StoredOverlayToken = {
        tokenHash: row.overlayTokenHash,
        sealed: {
          ciphertext: row.overlayCiphertext,
          iv: row.overlayIv,
          authTag: row.overlayAuthTag,
        } satisfies SealedSecret,
      };
      return token;
    },
  };
}
