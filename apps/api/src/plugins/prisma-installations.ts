import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { InstallationRejected, type InstallationRecord, type InstallationStore } from "./installations.js";

export function createPrismaInstallations(prisma: PrismaClient): InstallationStore {
  return {
    async enabledIds() {
      const rows = await prisma.pluginInstallation.findMany({
        where: { enabled: true, installed: true },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },
    async setEnabled(pluginId, enabled, version) {
      const existing = await prisma.pluginInstallation.findUnique({ where: { id: pluginId } });
      if (existing !== null && !existing.installed) throw new InstallationRejected("not_installed");
      if (existing !== null) {
        await prisma.pluginInstallation.update({ where: { id: pluginId }, data: { enabled } });
        return;
      }
      await prisma.pluginInstallation.create({
        data: { id: pluginId, enabled, version, installed: true, source: "official" },
      });
    },
    async get(pluginId) {
      const row = await prisma.pluginInstallation.findUnique({ where: { id: pluginId } });
      return row === null ? null : toRecord(row);
    },
    async list() {
      const rows = await prisma.pluginInstallation.findMany({ orderBy: { id: "asc" } });
      return rows.map(toRecord);
    },
    async save(record) {
      const data = {
        enabled: record.enabled,
        installed: record.installed,
        version: record.version,
        pinned: record.pinned,
        source: record.source,
        sha256: record.sha256,
        previousVersion: record.previousVersion,
        previousSha256: record.previousSha256,
        permissions: record.permissions as Prisma.InputJsonValue,
      };
      await prisma.pluginInstallation.upsert({
        where: { id: record.id },
        create: { id: record.id, ...data },
        update: data,
      });
    },
    async remove(pluginId) {
      await prisma.pluginInstallation.deleteMany({ where: { id: pluginId } });
    },
  };
}

function toRecord(row: {
  id: string;
  enabled: boolean;
  installed: boolean;
  version: string;
  pinned: boolean;
  source: string;
  sha256: string;
  previousVersion: string | null;
  previousSha256: string | null;
  permissions: Prisma.JsonValue;
}): InstallationRecord {
  return {
    id: row.id,
    enabled: row.enabled,
    installed: row.installed,
    version: row.version,
    pinned: row.pinned,
    source: row.source === "community" ? "community" : "official",
    sha256: row.sha256,
    previousVersion: row.previousVersion,
    previousSha256: row.previousSha256,
    permissions: readPermissions(row.permissions),
  };
}

function readPermissions(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
