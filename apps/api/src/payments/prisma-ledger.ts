import { asUntrustedText } from "@s4n/events";
import { DonationStatus, type PrismaClient } from "../../generated/prisma/client.js";
import type { Ledger, LedgerOrder, ListedDonation } from "./ledger.js";

export function createPrismaLedger(prisma: PrismaClient): Ledger {
  return {
    async create(order) {
      await prisma.donation.create({
        data: {
          id: order.id,
          providerId: order.providerId,
          amountMinor: order.amountMinor,
          currency: order.currency,
          status: DonationStatus.created,
          donorName: order.donorName,
          message: order.message,
        },
      });
    },
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
    async markFailed(id, providerRef) {
      const result = await prisma.donation.updateMany({
        where: { id, status: DonationStatus.created },
        data: {
          status: DonationStatus.failed,
          ...(providerRef ? { providerRef } : {}),
        },
      });
      return result.count === 1 ? "updated" : "lost_race";
    },
    async listRecent(limit) {
      const take = Math.min(100, Math.max(1, Math.floor(limit)));
      const rows = await prisma.donation.findMany({
        orderBy: { createdAt: "desc" },
        take,
      });
      return rows.map(toListed);
    },
  };
}

function toListed(row: {
  id: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  status: "created" | "succeeded" | "failed";
  providerRef: string | null;
  donorName: string;
  message: string;
  createdAt: Date;
}): ListedDonation {
  return {
    ...toOrder(row),
    donorName: row.donorName,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
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
