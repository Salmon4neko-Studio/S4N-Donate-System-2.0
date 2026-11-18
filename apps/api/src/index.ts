import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { createAuthService } from "./auth/service.js";
import { createPrismaAuthStore } from "./auth/prisma-store.js";
import { parseMasterKey } from "./crypto/master-key.js";
import { createPrisma } from "./db.js";
import { loadEnv } from "./env.js";
import { expireDueOrders, startPaymentExpiry } from "./payments/expiry.js";
import { createPrismaLedger } from "./payments/prisma-ledger.js";
import { createOfficialCatalog, createPaymentRegistry } from "./plugins/catalog.js";
import { createPrismaInstallations } from "./plugins/prisma-installations.js";
import { createPrismaSecretStore } from "./plugins/prisma-store.js";
import { createBundledMarketplace } from "./plugins/marketplace/service.js";
import { createChatHost } from "./chat/host.js";
import { createDurableBus } from "./realtime/bus.js";
import { mountDashboardSocket } from "./realtime/dashboard-socket.js";
import { createPostgresEventStore } from "./realtime/postgres-store.js";
import { mountOverlaySocket } from "./realtime/overlay-socket.js";
import { startEventRetention } from "./realtime/retention.js";

const root = resolve(import.meta.dirname, "../../..");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.example");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
} else if (existsSync(examplePath)) {
  loadDotenv({ path: examplePath });
  console.warn("Loaded .env.example because .env is missing.");
}

async function main(): Promise<void> {
  const env = loadEnv();
  const masterKey = parseMasterKey(env.masterKey, env.env);
  const catalog = createOfficialCatalog();
  const providers = createPaymentRegistry(catalog);
  const prisma = createPrisma(env.databaseUrl);
  const eventStore = createPostgresEventStore(prisma, env.databaseUrl);
  const bus = createDurableBus(eventStore);
  await bus.start();
  const stopRetention = startEventRetention(
    eventStore,
    {
      chatMs: env.eventChatRetentionHours * 3_600_000,
      defaultMs: env.eventRetentionDays * 86_400_000,
    },
    env.eventCleanupIntervalMinutes * 60_000,
  );
  const auth = createAuthService({ store: createPrismaAuthStore(prisma), masterKey });
  const installations = createPrismaInstallations(prisma);
  const secrets = createPrismaSecretStore(prisma);
  const marketplace = createBundledMarketplace({ installations, secrets, bus });

  const chatHost = createChatHost({ catalog, installations, secrets, masterKey, bus });

  const ledger = createPrismaLedger(prisma);
  const stopExpiry = startPaymentExpiry(
    () =>
      expireDueOrders({
        now: new Date(),
        ledger,
        providers,
        secrets,
        bus,
        masterKey,
      }).then(() => undefined),
    5 * 60 * 1000,
  );

  const app = createApp({
    envName: env.env,
    dashboardOrigin: env.dashboardOrigin,
    overlayOrigin: env.overlayOrigin,
    publicBaseUrl: env.publicBaseUrl,
    donationMin: env.donationMin,
    donationMax: env.donationMax,
    masterKey,
    catalog,
    providers,
    secrets,
    installations,
    marketplace,
    ledger,
    bus,
    auth,
    eventLog: "postgres",
    eventRetentionDays: env.eventRetentionDays,
    eventChatRetentionHours: env.eventChatRetentionHours,
    onPluginsChanged: () => {
      void chatHost.sync();
    },
    pingDatabase: async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return "up";
      } catch {
        return "down";
      }
    },
  });

  void chatHost.sync();
  const chatSync = setInterval(() => {
    void chatHost.sync();
  }, 3_000);
  chatSync.unref();
  void marketplace.ready();
  const registryCheck = setInterval(() => {
    void marketplace.check();
  }, 6 * 60 * 60 * 1000);
  registryCheck.unref();

  const replayLimit = env.eventReplayLimit;
  mountOverlaySocket(app, {
    bus,
    catalog,
    replayLimit,
    tokenValid: (token) => auth.overlayTokenValid(token),
    pluginEnabled: async (pluginId) => (await installations.enabledIds()).has(pluginId),
    readPublicSettings: (pluginId) => secrets.readPublicSettings(pluginId),
  });
  mountDashboardSocket(app, {
    bus,
    replayLimit,
    sessionValid: async (sessionId) => {
      if (sessionId === undefined) return false;
      const found = await auth.authenticate(sessionId);
      return found !== null;
    },
  });

  const sockets = new WebSocketServer({ noServer: true });
  const server = serve(
    {
      fetch: app.fetch,
      port: env.port,
      hostname: "0.0.0.0",
      websocket: { server: sockets },
    },
    (info) => {
      console.log(`S4N API listening on http://127.0.0.1:${info.port}`);
    },
  );

  const shutdown = () => {
    clearInterval(chatSync);
    clearInterval(registryCheck);
    stopExpiry();
    stopRetention();
    chatHost.stop();
    void bus.close().finally(() => {
      void eventStore.close().finally(() => {
        server.close();
      });
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "S4N API failed to start");
  process.exit(1);
});
