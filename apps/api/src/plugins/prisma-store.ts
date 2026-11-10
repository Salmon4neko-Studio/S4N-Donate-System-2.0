import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { SealedSecret } from "../crypto/secret-box.js";
import type { SecretStore } from "./settings.js";

export function createPrismaSecretStore(prisma: PrismaClient): SecretStore {
  return {
    persistence: "database",
    async readConfiguredKeys(pluginId) {
      const rows = await prisma.encryptedPluginSetting.findMany({
        where: { pluginId },
        select: { fieldKey: true },
      });
      return rows.map((row) => row.fieldKey);
    },
    async readPublicSettings(pluginId) {
      const row = await prisma.pluginInstallation.findUnique({ where: { id: pluginId } });
      return readPublicJson(row?.publicSettings);
    },
    async readSealed(pluginId) {
      const rows = await prisma.encryptedPluginSetting.findMany({ where: { pluginId } });
      const sealed: Record<string, SealedSecret> = {};
      for (const row of rows) {
        sealed[row.fieldKey] = {
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
        };
      }
      return sealed;
    },
    async write(pluginId, input) {
      await prisma.$transaction(async (tx) => {
        await tx.pluginInstallation.upsert({
          where: { id: pluginId },
          create: {
            id: pluginId,
            version: input.version,
            publicSettings: input.publicSettings as Prisma.InputJsonValue,
          },
          update: {
            version: input.version,
            publicSettings: input.publicSettings as Prisma.InputJsonValue,
          },
        });
        for (const [fieldKey, sealed] of Object.entries(input.secrets)) {
          const data = {
            ciphertext: Buffer.from(sealed.ciphertext),
            iv: Buffer.from(sealed.iv),
            authTag: Buffer.from(sealed.authTag),
          };
          await tx.encryptedPluginSetting.upsert({
            where: { pluginId_fieldKey: { pluginId, fieldKey } },
            create: { pluginId, fieldKey, ...data },
            update: data,
          });
        }
      });
    },
  };
}

function readPublicJson(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      output[key] = item;
    }
  }
  return output;
}
