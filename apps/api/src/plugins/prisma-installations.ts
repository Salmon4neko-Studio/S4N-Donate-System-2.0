import type { PrismaClient } from "../../generated/prisma/client.js";
import type { InstallationStore } from "./installations.js";

export function createPrismaInstallations(prisma: PrismaClient): InstallationStore {
  return {
    async enabledIds() {
      const rows = await prisma.pluginInstallation.findMany({
        where: { enabled: true },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },
    async setEnabled(pluginId, enabled, version) {
      await prisma.pluginInstallation.upsert({
        where: { id: pluginId },
        create: { id: pluginId, enabled, version },
        update: { enabled, version },
      });
    },
  };
}
