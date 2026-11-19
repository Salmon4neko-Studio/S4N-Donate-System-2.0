import { sameAwaitSlip, type AwaitSlip, type DonationState, type Ledger, type LedgerOrder, type ListedDonation } from "./ledger.js";

export function createMemoryLedger(seed: readonly LedgerOrder[] = []): Ledger {
  const rows = new Map<string, LedgerOrder>(seed.map((order) => [order.id, normalize(order)]));
  const createdAt = new Map<string, string>();
  const updatedAt = new Map<string, string>();
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  for (const order of seed) {
    const stamp = new Date(clock).toISOString();
    createdAt.set(order.id, stamp);
    updatedAt.set(order.id, stamp);
    clock += 1000;
  }
  const touch = (id: string) => {
    updatedAt.set(id, new Date().toISOString());
  };
  return {
    async create(order) {
      if (rows.has(order.id)) throw new Error("duplicate_order");
      rows.set(order.id, {
        ...normalize(order),
        status: "created",
        providerRef: null,
        bankCode: null,
        payCode: null,
        barcodes: null,
        paymentType: null,
        reviewNotice: null,
      });
      const stamp = new Date().toISOString();
      createdAt.set(order.id, stamp);
      updatedAt.set(order.id, stamp);
    },
    async getById(id) {
      const row = rows.get(id);
      return row === undefined
        ? null
        : {
            ...row,
            barcodes: copyBarcodes(row.barcodes),
            reviewNotice: row.reviewNotice === null ? null : { ...row.reviewNotice },
          };
    },
    async markSucceeded(id, providerRef) {
      const row = rows.get(id);
      if (row === undefined || !canPay(row.status)) return "lost_race";
      row.status = "succeeded";
      row.providerRef = providerRef;
      touch(id);
      return "updated";
    },
    async markNeedsReview(id, input) {
      const row = rows.get(id);
      if (row === undefined) return "lost_race";
      if (row.status === "review") return "duplicate";
      if (row.status !== "expired") return "lost_race";
      row.status = "review";
      if (row.providerRef === null) row.providerRef = input.providerRef;
      row.reviewNotice = { ...input.notice };
      touch(id);
      return "updated";
    },
    async markFailed(id, providerRef) {
      const row = rows.get(id);
      if (row === undefined || (row.status !== "created" && row.status !== "awaiting")) return "lost_race";
      row.status = "failed";
      if (providerRef) row.providerRef = providerRef;
      touch(id);
      return "updated";
    },
    async markAwaiting(id, slip) {
      const row = rows.get(id);
      if (row === undefined) return "lost_race";
      if (row.status === "awaiting") return sameAwaitSlip(row, slip) ? "duplicate" : "conflict";
      if (row.status !== "created") return "lost_race";
      applySlip(row, slip);
      row.status = "awaiting";
      touch(id);
      return "updated";
    },
    async markExpired(id) {
      const row = rows.get(id);
      if (row === undefined || (row.status !== "created" && row.status !== "awaiting")) return "lost_race";
      row.status = "expired";
      touch(id);
      return "updated";
    },
    async listDue(now, limit) {
      const take = clampLimit(limit);
      const due = [...rows.values()].filter(
        (row) =>
          (row.status === "created" || row.status === "awaiting") &&
          row.expiresAt !== null &&
          Date.parse(row.expiresAt) <= now.getTime(),
      );
      due.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
      return due.slice(0, take).map((row) => ({ ...row, barcodes: copyBarcodes(row.barcodes) }));
    },
    async listRecent(limit, status) {
      const take = clampLimit(limit);
      const listed: ListedDonation[] = [...rows.values()]
        .filter((row) => status === undefined || row.status === status)
        .map((row) => ({
          id: row.id,
          providerId: row.providerId,
          providerRef: row.providerRef,
          amountMinor: row.amountMinor,
          currency: row.currency,
          status: row.status,
          donorName: row.donorName,
          message: row.message,
          createdAt: createdAt.get(row.id) ?? new Date(0).toISOString(),
          expiresAt: row.expiresAt,
          bankCode: row.bankCode,
          payCode: row.payCode,
          barcodes: copyBarcodes(row.barcodes),
          reviewNotice: row.reviewNotice === null ? null : { ...row.reviewNotice },
        }));
      listed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      return listed.slice(0, take);
    },
    async sumPaid(input) {
      const allowed = new Set(input.statuses);
      const sinceMs = input.since === null ? null : Date.parse(input.since);
      let total = 0;
      for (const row of rows.values()) {
        if (!allowed.has(row.status) || row.currency !== input.currency) continue;
        if (sinceMs !== null && !Number.isNaN(sinceMs)) {
          const updated = Date.parse(updatedAt.get(row.id) ?? "");
          if (Number.isNaN(updated) || updated < sinceMs) continue;
        }
        total += row.amountMinor;
      }
      return total;
    },
    async listPaidRecent(limit, currency) {
      const take = Math.min(20, Math.max(1, Math.floor(limit)));
      const listed = [...rows.values()]
        .filter((row) => row.status === "succeeded" && row.currency === currency)
        .map((row) => ({
          row,
          updated: updatedAt.get(row.id) ?? "",
        }));
      listed.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
      return listed.slice(0, take).map(({ row }) => ({
        id: row.id,
        providerId: row.providerId,
        providerRef: row.providerRef,
        amountMinor: row.amountMinor,
        currency: row.currency,
        status: row.status,
        donorName: row.donorName,
        message: row.message,
        createdAt: createdAt.get(row.id) ?? new Date(0).toISOString(),
        expiresAt: row.expiresAt,
        bankCode: row.bankCode,
        payCode: row.payCode,
        barcodes: copyBarcodes(row.barcodes),
        reviewNotice: row.reviewNotice === null ? null : { ...row.reviewNotice },
      }));
    },
  };
}

function canPay(status: DonationState): boolean {
  return status === "created" || status === "awaiting";
}

function applySlip(row: LedgerOrder, slip: AwaitSlip): void {
  row.providerRef = slip.providerRef;
  row.bankCode = slip.bankCode;
  row.payCode = slip.payCode;
  row.barcodes = copyBarcodes(slip.barcodes);
  row.expiresAt = slip.expiresAt;
  row.paymentType = slip.paymentType;
}

function normalize(order: LedgerOrder): LedgerOrder {
  return {
    ...order,
    expiresAt: order.expiresAt ?? null,
    bankCode: order.bankCode ?? null,
    payCode: order.payCode ?? null,
    barcodes: copyBarcodes(order.barcodes ?? null),
    paymentType: order.paymentType ?? null,
    reviewNotice: order.reviewNotice ?? null,
  };
}

function copyBarcodes(codes: readonly [string, string, string] | null): readonly [string, string, string] | null {
  return codes === null ? null : [codes[0], codes[1], codes[2]];
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}
