import assert from "node:assert/strict";
import type { Hono } from "hono";
import { createApp, type AppDeps } from "../app.js";
import type { SessionEnv } from "../auth/session.js";
import { createAuthService, type AuthService } from "../auth/service.js";
import { createCoreBus, type CoreBus } from "../realtime/bus.js";
import { createMemoryLedger } from "../payments/memory-ledger.js";
import type { Ledger } from "../payments/ledger.js";
import { createOfficialCatalog, createPaymentRegistry, type PaymentRegistry } from "../plugins/catalog.js";
import { createMemoryInstallations, type InstallationStore } from "../plugins/installations.js";
import { createMemorySecretStore } from "../plugins/memory-store.js";
import { createBundledMarketplace, type MarketplaceService } from "../plugins/marketplace/service.js";
import { createMemoryAuthStore } from "../auth/store.js";
import { createMemoryOverlayLayoutStore } from "../realtime/overlay-layout.js";
import type { SecretStore } from "../plugins/settings.js";

export const TEST_ORIGIN = "http://localhost:5180";
export const TEST_OPERATOR = {
  email: "operator@example.com",
  password: "correct-horse-battery",
};

type TestOverrides = Partial<AppDeps> & {
  sessionTtlMs?: number;
  rotateAfterMs?: number;
};

export function createTestApp(overrides: TestOverrides = {}): {
  app: Hono<SessionEnv>;
  masterKey: Buffer;
  secrets: SecretStore;
  ledger: Ledger;
  bus: CoreBus;
  providers: PaymentRegistry;
  auth: AuthService;
  installations: InstallationStore;
  marketplace: MarketplaceService;
} {
  const {
    sessionTtlMs,
    rotateAfterMs,
    auth: authOverride,
    marketplace: marketplaceOverride,
    installations: installationsOverride,
    secrets: secretsOverride,
    bus: busOverride,
    catalog: catalogOverride,
    ...rest
  } = overrides;
  const masterKey = rest.masterKey ?? Buffer.alloc(32, 7);
  const catalog = catalogOverride ?? createOfficialCatalog();
  const secrets = secretsOverride ?? createMemorySecretStore();
  const ledger = rest.ledger ?? createMemoryLedger();
  const bus = busOverride ?? createCoreBus();
  const providers = rest.providers ?? createPaymentRegistry(catalog);
  const installations = installationsOverride ?? createMemoryInstallations();
  const marketplace =
    marketplaceOverride ?? createBundledMarketplace({ installations, secrets, bus });
  const auth =
    authOverride ??
    createAuthService({
      store: createMemoryAuthStore(),
      masterKey,
      ...(sessionTtlMs !== undefined ? { ttlMs: sessionTtlMs } : {}),
      ...(rotateAfterMs !== undefined ? { rotateAfterMs } : {}),
    });
  const app = createApp({
    envName: "test",
    dashboardOrigin: TEST_ORIGIN,
    overlayOrigin: "http://localhost:5181",
    publicBaseUrl: "https://donate.example",
    donationMin: 30,
    donationMax: 20_000,
    masterKey,
    catalog,
    providers,
    secrets,
    installations,
    marketplace,
    ledger,
    bus,
    auth,
    layouts: createMemoryOverlayLayoutStore(),
    pingDatabase: async () => "unconfigured",
    ...rest,
  });
  return { app, masterKey, secrets, ledger, bus, providers, auth, installations, marketplace };
}

export function sessionCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();
  const pair = cookies
    .map((cookie) => cookie.split(";")[0] ?? "")
    .find((cookie) => cookie.startsWith("s4n_session="));
  if (pair === undefined || pair.length <= "s4n_session=".length) {
    throw new Error(`missing session cookie: ${cookies.join(" | ")}`);
  }
  return pair;
}

export async function setupOperator(app: Hono<SessionEnv>): Promise<string> {
  const response = await app.request("/api/auth/setup", {
    method: "POST",
    headers: {
      origin: TEST_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(TEST_OPERATOR),
  });
  assert.equal(response.status, 201);
  return sessionCookie(response);
}
