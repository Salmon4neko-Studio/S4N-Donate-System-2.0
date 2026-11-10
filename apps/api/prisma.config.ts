import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

const root = resolve(import.meta.dirname, "../..");
const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  config({ path: envFile });
}

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://s4n:s4n_dev_password@localhost:5432/s4n";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
