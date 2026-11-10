import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { parseMasterKey } from "./crypto/master-key.js";
import { createPrisma } from "./db.js";
import { loadEnv } from "./env.js";
import { createPrismaLedger } from "./payments/prisma-ledger.js";
import { createOfficialCatalog, createPaymentRegistry } from "./plugins/catalog.js";
import { createPrismaSecretStore } from "./plugins/prisma-store.js";
import { createCoreBus } from "./realtime/bus.js";
import { mountOverlaySocket } from "./realtime/overlay-socket.js";

const root = resolve(import.meta.dirname, "../../..");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.example");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
} else if (existsSync(examplePath)) {
  loadDotenv({ path: examplePath });
  console.warn("Loaded .env.example because .env is missing.");
}

const env = loadEnv();
const masterKey = parseMasterKey(env.masterKey, env.env);
const catalog = createOfficialCatalog();
const providers = createPaymentRegistry(catalog);
const bus = createCoreBus();
const prisma = createPrisma(env.databaseUrl);

const app = createApp({
  envName: env.env,
  dashboardOrigin: env.dashboardOrigin,
  masterKey,
  catalog,
  providers,
  secrets: createPrismaSecretStore(prisma),
  ledger: createPrismaLedger(prisma),
  bus,
  pingDatabase: async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return "up";
    } catch {
      return "down";
    }
  },
});

mountOverlaySocket(app, bus);

const sockets = new WebSocketServer({ noServer: true });
serve(
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
