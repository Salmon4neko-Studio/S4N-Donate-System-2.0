import { asUntrustedText } from "@s4n/events";
import { DonationStatus, type PrismaClient } from "../../generated/prisma/client.js";
import type { Ledger, LedgerOrder } from "./ledger.js";

export function createPrismaLedger(prisma: PrismaClient): Ledger {
  return {
    async getById(id) {
      const row = await prisma.donation.findUnique({ where: { id } });
      if (row === null) return null;
      return toOrder(row);
    },
    async markSucceeded(id, providerRef) {
      const result = await prisma.donation.updateMany({
        where: { id, status: DonationStatus.created },
        data: { status: DonationStatus.succeeded, providerRef },
      });
      return result.count === 1 ? "updated" : "lost_race";
    },
  };
}

function toOrder(row: {
  id: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  status: "created" | "succeeded" | "failed";
  providerRef: string | null;
  donorName: string;
  message: string;
}): LedgerOrder {
  return {
    id: row.id,
    providerId: row.providerId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    providerRef: row.providerRef,
    donorName: asUntrustedText(row.donorName),
    message: asUntrustedText(row.message),
  };
}
