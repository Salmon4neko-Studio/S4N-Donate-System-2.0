import type { Hono } from "hono";
import { createApp, type AppDeps } from "../app.js";
import { createCoreBus, type CoreBus } from "../realtime/bus.js";
import { createMemoryLedger } from "../payments/memory-ledger.js";
import type { Ledger } from "../payments/ledger.js";
import { createOfficialCatalog, createPaymentRegistry, type PaymentRegistry } from "../plugins/catalog.js";
import { createMemorySecretStore } from "../plugins/memory-store.js";
import type { SecretStore } from "../plugins/settings.js";

export function createTestApp(overrides: Partial<AppDeps> = {}): {
  app: Hono;
  masterKey: Buffer;
  secrets: SecretStore;
  ledger: Ledger;
  bus: CoreBus;
  providers: PaymentRegistry;
} {
  const masterKey = Buffer.alloc(32, 7);
  const catalog = createOfficialCatalog();
  const secrets = createMemorySecretStore();
  const ledger = createMemoryLedger();
  const bus = createCoreBus();
  const providers = createPaymentRegistry(catalog);
  const app = createApp({
    envName: "test",
    dashboardOrigin: "http://localhost:5180",
    masterKey,
    catalog,
    providers,
    secrets,
    ledger,
    bus,
    pingDatabase: async () => "unconfigured",
    ...overrides,
  });
  return {
    app,
    masterKey: overrides.masterKey ?? masterKey,
    secrets: overrides.secrets ?? secrets,
    ledger: overrides.ledger ?? ledger,
    bus: overrides.bus ?? bus,
    providers: overrides.providers ?? providers,
  };
}
