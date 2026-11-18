import { sameAwaitSlip, type AwaitSlip, type DonationState, type Ledger, type LedgerOrder, type ListedDonation } from "./ledger.js";

export function createMemoryLedger(seed: readonly LedgerOrder[] = []): Ledger {
  const rows = new Map<string, LedgerOrder>(seed.map((order) => [order.id, normalize(order)]));
  const createdAt = new Map<string, string>();
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  for (const order of seed) {
    createdAt.set(order.id, new Date(clock).toISOString());
    clock += 1000;
  }
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
      });
      createdAt.set(order.id, new Date().toISOString());
    },
    async getById(id) {
      const row = rows.get(id);
      return row === undefined ? null : { ...row, barcodes: copyBarcodes(row.barcodes) };
    },
    async markSucceeded(id, providerRef) {
      const row = rows.get(id);
      if (row === undefined || !canPay(row.status)) return "lost_race";
      row.status = "succeeded";
      row.providerRef = providerRef;
      return "updated";
    },
    async markFailed(id, providerRef) {
      const row = rows.get(id);
      if (row === undefined || (row.status !== "created" && row.status !== "awaiting")) return "lost_race";
      row.status = "failed";
      if (providerRef) row.providerRef = providerRef;
      return "updated";
    },
    async markAwaiting(id, slip) {
      const row = rows.get(id);
      if (row === undefined) return "lost_race";
      if (row.status === "awaiting") return sameAwaitSlip(row, slip) ? "duplicate" : "conflict";
      if (row.status !== "created") return "lost_race";
      applySlip(row, slip);
      row.status = "awaiting";
      return "updated";
    },
    async markExpired(id) {
      const row = rows.get(id);
      if (row === undefined || (row.status !== "created" && row.status !== "awaiting")) return "lost_race";
      row.status = "expired";
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
        }));
      listed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      return listed.slice(0, take);
    },
  };
}

function canPay(status: DonationState): boolean {
  return status === "created" || status === "awaiting" || status === "expired";
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
  };
}

function copyBarcodes(codes: readonly [string, string, string] | null): readonly [string, string, string] | null {
  return codes === null ? null : [codes[0], codes[1], codes[2]];
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}
