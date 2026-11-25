import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { parseOverlayRect, type OverlayRect } from "s4n-donate-system-2.0-plugin-sdk";
import type { OverlayLayoutStore, StoredLayout } from "./overlay-layout.js";

export function createPrismaOverlayLayoutStore(prisma: PrismaClient): OverlayLayoutStore {
  return {
    async read(operatorId) {
      const row = await prisma.overlayLayout.findUnique({ where: { operatorId } });
      if (row === null) return null;
      return {
        width: row.width,
        height: row.height,
        slots: readSlots(row.slots),
      };
    },
    async write(operatorId, layout) {
      const data = {
        width: layout.width,
        height: layout.height,
        slots: layout.slots as unknown as Prisma.InputJsonValue,
      };
      await prisma.overlayLayout.upsert({
        where: { operatorId },
        create: { operatorId, ...data },
        update: data,
      });
    },
  };
}

function readSlots(value: unknown): StoredLayout["slots"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const slots: Record<string, OverlayRect> = {};
  for (const [id, raw] of Object.entries(value)) {
    const rect = parseOverlayRect(raw);
    if (rect !== null) slots[id] = rect;
  }
  return slots;
}
