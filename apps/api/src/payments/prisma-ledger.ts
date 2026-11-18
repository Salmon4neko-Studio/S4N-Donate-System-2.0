import { asUntrustedText } from "@s4n/events";
import { DonationStatus, type PrismaClient } from "../../generated/prisma/client.js";
import { sameAwaitSlip, type AwaitSlip, type DonationState, type Ledger, type LedgerOrder, type ListedDonation } from "./ledger.js";

const PAYABLE = [DonationStatus.created, DonationStatus.awaiting, DonationStatus.expired];

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
          expiresAt: order.expiresAt === null ? null : new Date(order.expiresAt),
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
        where: { id, status: { in: PAYABLE } },
        data: { status: DonationStatus.succeeded, providerRef },
      });
      return result.count === 1 ? "updated" : "lost_race";
    },
    async markFailed(id, providerRef) {
      const result = await prisma.donation.updateMany({
        where: { id, status: { in: [DonationStatus.created, DonationStatus.awaiting] } },
        data: {
          status: DonationStatus.failed,
          ...(providerRef ? { providerRef } : {}),
        },
      });
      return result.count === 1 ? "updated" : "lost_race";
    },
    async markAwaiting(id, slip) {
      const existing = await prisma.donation.findUnique({ where: { id } });
      if (existing === null) return "lost_race";
      const current = toOrder(existing);
      if (current.status === "awaiting") return sameAwaitSlip(current, slip) ? "duplicate" : "conflict";
      if (current.status !== "created") return "lost_race";
      const result = await prisma.donation.updateMany({
        where: { id, status: DonationStatus.created },
        data: slipData(slip),
      });
      if (result.count === 1) return "updated";
      const again = await prisma.donation.findUnique({ where: { id } });
      if (again !== null && sameAwaitSlip(toOrder(again), slip)) return "duplicate";
      return "lost_race";
    },
    async markExpired(id) {
      const result = await prisma.donation.updateMany({
        where: { id, status: { in: [DonationStatus.created, DonationStatus.awaiting] } },
        data: { status: DonationStatus.expired },
      });
      return result.count === 1 ? "updated" : "lost_race";
    },
    async listDue(now, limit) {
      const take = Math.min(100, Math.max(1, Math.floor(limit)));
      const rows = await prisma.donation.findMany({
        where: {
          status: { in: [DonationStatus.created, DonationStatus.awaiting] },
          expiresAt: { lte: now },
        },
        orderBy: { expiresAt: "asc" },
        take,
      });
      return rows.map(toOrder);
    },
    async listRecent(limit, status) {
      const take = Math.min(100, Math.max(1, Math.floor(limit)));
      const rows = await prisma.donation.findMany({
        where: status === undefined ? {} : { status: toPrismaStatus(status) },
        orderBy: { createdAt: "desc" },
        take,
      });
      return rows.map(toListed);
    },
  };
}

function slipData(slip: AwaitSlip) {
  return {
    status: DonationStatus.awaiting,
    providerRef: slip.providerRef,
    bankCode: slip.bankCode,
    payCode: slip.payCode,
    barcode1: slip.barcodes?.[0] ?? null,
    barcode2: slip.barcodes?.[1] ?? null,
    barcode3: slip.barcodes?.[2] ?? null,
    expiresAt: new Date(slip.expiresAt),
    paymentType: slip.paymentType,
  };
}

function toListed(row: DonationRow): ListedDonation {
  const order = toOrder(row);
  return {
    ...order,
    donorName: row.donorName,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    barcodes: order.barcodes,
  };
}

function toOrder(row: DonationRow): LedgerOrder {
  const barcodes =
    row.barcode1 !== null && row.barcode2 !== null && row.barcode3 !== null
      ? ([row.barcode1, row.barcode2, row.barcode3] as const)
      : null;
  return {
    id: row.id,
    providerId: row.providerId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    providerRef: row.providerRef,
    donorName: asUntrustedText(row.donorName),
    message: asUntrustedText(row.message),
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    bankCode: row.bankCode,
    payCode: row.payCode,
    barcodes,
    paymentType: row.paymentType,
  };
}

function toPrismaStatus(status: DonationState): DonationStatus {
  return DonationStatus[status];
}

interface DonationRow {
  id: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  status: DonationState;
  providerRef: string | null;
  donorName: string;
  message: string;
  createdAt: Date;
  expiresAt: Date | null;
  bankCode: string | null;
  payCode: string | null;
  barcode1: string | null;
  barcode2: string | null;
  barcode3: string | null;
  paymentType: string | null;
}
