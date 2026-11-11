import type { Ledger, LedgerOrder, ListedDonation } from "./ledger.js";

export function createMemoryLedger(seed: readonly LedgerOrder[] = []): Ledger {
  const rows = new Map<string, LedgerOrder>(seed.map((order) => [order.id, { ...order }]));
  const createdAt = new Map<string, string>();
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  for (const order of seed) {
    createdAt.set(order.id, new Date(clock).toISOString());
    clock += 1000;
  }
  return {
    async getById(id) {
      const row = rows.get(id);
      return row === undefined ? null : { ...row };
    },
    async markSucceeded(id, providerRef) {
      const row = rows.get(id);
      if (row === undefined || row.status !== "created") return "lost_race";
      row.status = "succeeded";
      row.providerRef = providerRef;
      return "updated";
    },
    async listRecent(limit) {
      const take = clampLimit(limit);
      const listed: ListedDonation[] = [...rows.values()].map((row) => ({
        id: row.id,
        providerId: row.providerId,
        providerRef: row.providerRef,
        amountMinor: row.amountMinor,
        currency: row.currency,
        status: row.status,
        donorName: row.donorName,
        message: row.message,
        createdAt: createdAt.get(row.id) ?? new Date(0).toISOString(),
      }));
      listed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      return listed.slice(0, take);
    },
  };
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}
