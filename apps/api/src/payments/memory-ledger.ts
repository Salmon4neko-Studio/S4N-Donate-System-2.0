import type { Ledger, LedgerOrder } from "./ledger.js";

export function createMemoryLedger(seed: readonly LedgerOrder[] = []): Ledger {
  const rows = new Map<string, LedgerOrder>(seed.map((order) => [order.id, { ...order }]));
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
  };
}
