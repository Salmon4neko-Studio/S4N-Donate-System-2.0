import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJson } from "../src/plugins/marketplace/canonical.ts";
import { digestManifest } from "../src/plugins/marketplace/digest.ts";
import { BUNDLED_PLUGIN_FILES } from "../src/plugins/marketplace/packages.ts";
import { parseRegistryIndex } from "../src/plugins/marketplace/parse.ts";
import { signMessage } from "../src/plugins/marketplace/signature.ts";

/**
 * Build the official registry envelope.
 * The private key is S4N_REGISTRY_SIGNING_KEY (PKCS8 PEM). It is not read from the repo.
 *
 *   S4N_REGISTRY_SIGNING_KEY="$(cat signing-key.pem)" pnpm --filter @s4n/api exec tsx scripts/sign-registry.ts
 */
const pem = process.env.S4N_REGISTRY_SIGNING_KEY;
if (pem === undefined || !pem.includes("PRIVATE KEY")) {
  console.error("S4N_REGISTRY_SIGNING_KEY must be a PKCS8 PEM. It is not stored in the repo.");
  process.exit(1);
}

const apiRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(apiRoot, "../..");
const listings = JSON.parse(readFileSync(resolve(apiRoot, "registry/listings.json"), "utf8")) as Array<{
  id: string;
  category: string;
  author: string;
  featured: boolean;
  icon: string;
  changelog: string;
  screenshots: unknown[];
}>;

const listed = new Set(listings.map((item) => item.id));
for (const id of Object.keys(BUNDLED_PLUGIN_FILES)) {
  if (!listed.has(id)) {
    console.error(`listings.json is missing ${id}`);
    process.exit(1);
  }
}

const plugins = listings.map((listing) => {
  const relative = BUNDLED_PLUGIN_FILES[listing.id];
  if (relative === undefined) {
    console.error(`unknown plugin ${listing.id}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, relative), "utf8")) as {
    id: string;
    name: string;
    version: string;
    api: string;
    description: string;
    permissions: string[];
    kind: string[];
  };
  if (manifest.id !== listing.id) {
    console.error(`manifest id ${manifest.id} does not match ${listing.id}`);
    process.exit(1);
  }
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    api: manifest.api,
    category: listing.category,
    author: listing.author,
    official: true,
    description: manifest.description,
    icon: listing.icon,
    permissions: manifest.permissions,
    kind: manifest.kind,
    changelog: listing.changelog,
    compatibility: { core: "0.1", pluginSpec: "0.1" },
    sha256: digestManifest(manifest),
    featured: listing.featured,
    screenshots: listing.screenshots,
  };
});

const index = {
  format: "s4n-registry-index",
  version: 1,
  issuedAt: "2026-11-19T12:00:00.000Z",
  plugins,
};

parseRegistryIndex(index);
const signature = signMessage(Buffer.from(canonicalJson(index), "utf8"), pem).toString("base64");
const destination = resolve(apiRoot, "registry/official.json");
writeFileSync(destination, `${JSON.stringify({ index, signature }, null, 2)}\n`);
console.log(`wrote ${destination}`);
