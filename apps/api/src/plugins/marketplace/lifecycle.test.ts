import assert from "node:assert/strict";
import { test } from "node:test";
import { createPluginBus } from "@s4n/plugin-sdk";
import { createCoreBus } from "../../realtime/bus.js";
import { createDurableBus } from "../../realtime/bus.js";
import { createMemoryEventStore } from "../../realtime/event-store.js";
import { purgeExpired } from "../../realtime/retention.js";
import { createMemoryInstallations } from "../installations.js";
import { createMemorySecretStore } from "../memory-store.js";
import { canonicalJson } from "./canonical.js";
import { PluginLoadError, type PackageSpec, type PluginLoader } from "./loader.js";
import { createMemorySource } from "./source.js";
import { MarketplaceService } from "./service.js";
import { generateEd25519, signMessage } from "./signature.js";
import type { RegistryIndex, RegistryPlugin } from "./types.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../../test/fixture.js";

function plugin(overrides: Partial<RegistryPlugin> = {}): RegistryPlugin {
  return {
    id: "official.alerts",
    name: "贊助提醒",
    version: "0.2.0",
    api: "0.1",
    category: "overlay",
    author: "S4N",
    official: true,
    description: "疊層提醒。",
    icon: "bell",
    permissions: ["events.subscribe", "overlay.slot"],
    kind: ["overlay"],
    changelog: "這個版本多了一項權限。",
    compatibility: { core: "0.1", pluginSpec: "0.1" },
    sha256: "cd".repeat(32),
    featured: false,
    screenshots: [],
    ...overrides,
  };
}

function signed(index: RegistryIndex, privateKeyPem: string): Uint8Array {
  const signature = signMessage(Buffer.from(canonicalJson(index), "utf8"), privateKeyPem).toString("base64");
  return Buffer.from(JSON.stringify({ index, signature }));
}

function index(plugins: RegistryPlugin[]): RegistryIndex {
  return {
    format: "s4n-registry-index",
    version: 1,
    issuedAt: "2026-11-18T07:00:00.000Z",
    plugins,
  };
}

function loader(accept: PackageSpec[], failStart = new Set<string>()): PluginLoader {
  const known = new Map(accept.map((spec) => [`${spec.id}@${spec.version}`, spec.sha256]));
  const check = (spec: PackageSpec): void => {
    const digest = known.get(`${spec.id}@${spec.version}`);
    if (digest === undefined) throw new PluginLoadError("not_in_runtime");
    if (digest !== spec.sha256) throw new PluginLoadError("package_integrity");
  };
  return {
    async stage(spec) {
      check(spec);
    },
    async start(spec) {
      check(spec);
      if (failStart.has(`${spec.id}@${spec.version}`)) throw new PluginLoadError("not_in_runtime");
    },
  };
}

test("install, update permission review, uninstall, and rollback", async () => {
  const keys = generateEd25519();
  const current = plugin();
  const olderPermissions = ["events.subscribe"];
  const installations = createMemoryInstallations();
  const secrets = createMemorySecretStore();
  const bus = createCoreBus();
  await installations.save({
    id: current.id,
    enabled: true,
    installed: true,
    version: "0.1.0",
    pinned: false,
    source: "official",
    sha256: "11".repeat(32),
    previousVersion: null,
    previousSha256: null,
    permissions: olderPermissions,
  });
  await secrets.write(current.id, {
    version: "0.1.0",
    publicSettings: { durationMs: 4000 },
    secrets: {},
  });
  const service = new MarketplaceService({
    official: createMemorySource("official", signed(index([current]), keys.privateKeyPem)),
    community: createMemorySource("community", null),
    publicKey: keys.publicKeySpki,
    installations,
    secrets,
    bus,
    loader: loader([{ id: current.id, version: current.version, sha256: current.sha256 }]),
  });

  const before = await service.listing(current.id);
  assert.equal(before.updateAvailable, true);
  assert.deepEqual(before.addedPermissions, ["overlay.slot"]);

  await assert.rejects(
    () => service.update(current.id, olderPermissions),
    (error: unknown) => error instanceof Error && error.message === "permissions_not_accepted",
  );
  assert.equal((await installations.get(current.id))?.version, "0.1.0");

  const updated = await service.update(current.id, current.permissions);
  assert.equal(updated.installedVersion, "0.2.0");
  assert.equal(updated.previousVersion, "0.1.0");
  assert.equal(updated.enabled, true);

  const events = await bus.readRecent(10);
  const audit = events.find((event) => event.type === "s4n.plugin.changed");
  assert.ok(audit);
  assert.equal(audit.type, "s4n.plugin.changed");
  if (audit.type !== "s4n.plugin.changed") return;
  assert.equal(audit.payload.action, "update");
  assert.deepEqual(audit.payload.addedPermissions, ["overlay.slot"]);
  const encoded = JSON.stringify(audit.payload);
  assert.equal(encoded.includes("hashKey"), false);
  assert.equal(encoded.includes("ciphertext"), false);

  await service.uninstall(current.id, true);
  assert.equal((await installations.get(current.id))?.installed, false);
  assert.equal((await secrets.readPublicSettings(current.id)).durationMs, 4000);
  await assert.rejects(() => service.setEnabled(current.id, true), /not_installed/);

  const reinstalled = await service.install(current.id, current.permissions);
  assert.equal(reinstalled.installed, true);
  assert.equal(reinstalled.enabled, false);
  assert.equal((await secrets.readPublicSettings(current.id)).durationMs, 4000);

  await service.uninstall(current.id, false);
  assert.equal(await installations.get(current.id), null);
  assert.deepEqual(await secrets.readPublicSettings(current.id), {});
});

test("a failed update rolls back to the previous version", async () => {
  const keys = generateEd25519();
  const next = plugin({ version: "0.3.0", sha256: "ee".repeat(32), permissions: ["events.subscribe", "overlay.slot"] });
  const installations = createMemoryInstallations();
  await installations.save({
    id: next.id,
    enabled: true,
    installed: true,
    version: "0.2.0",
    pinned: false,
    source: "official",
    sha256: "cd".repeat(32),
    previousVersion: null,
    previousSha256: null,
    permissions: ["events.subscribe", "overlay.slot"],
  });
  const bus = createCoreBus();
  const service = new MarketplaceService({
    official: createMemorySource("official", signed(index([next]), keys.privateKeyPem)),
    community: createMemorySource("community", null),
    publicKey: keys.publicKeySpki,
    installations,
    secrets: createMemorySecretStore(),
    bus,
    loader: loader([{ id: next.id, version: next.version, sha256: next.sha256 }], new Set([`${next.id}@${next.version}`])),
  });

  await assert.rejects(() => service.update(next.id, next.permissions), /update_rolled_back/);
  const record = await installations.get(next.id);
  assert.equal(record?.version, "0.2.0");
  assert.equal(record?.sha256, "cd".repeat(32));
  assert.equal(record?.enabled, true);
  const events = await bus.readRecent(5);
  assert.equal(events.some((event) => event.type === "s4n.plugin.changed" && event.payload.action === "rollback"), true);
});

test("a pinned version and a tampered package are not applied", async () => {
  const keys = generateEd25519();
  const next = plugin();
  const installations = createMemoryInstallations();
  await installations.save({
    id: next.id,
    enabled: false,
    installed: true,
    version: "0.1.0",
    pinned: true,
    source: "official",
    sha256: "11".repeat(32),
    previousVersion: null,
    previousSha256: null,
    permissions: [...next.permissions],
  });
  const service = new MarketplaceService({
    official: createMemorySource("official", signed(index([next]), keys.privateKeyPem)),
    community: createMemorySource("community", null),
    publicKey: keys.publicKeySpki,
    installations,
    secrets: createMemorySecretStore(),
    bus: createCoreBus(),
    loader: loader([{ id: next.id, version: "9.9.9", sha256: next.sha256 }]),
  });
  await assert.rejects(() => service.update(next.id, next.permissions), /version_pinned/);
  await service.setPinned(next.id, false);
  await assert.rejects(() => service.update(next.id, next.permissions), /package_integrity|not_in_runtime|version_mismatch/);
  assert.equal((await installations.get(next.id))?.version, "0.1.0");
});

test("a community payment plugin cannot be installed", async () => {
  const keys = generateEd25519();
  const payment = plugin({
    id: "community.pay",
    name: "社群金流",
    official: false,
    category: "payment",
    icon: "credit-card",
    kind: ["payment"],
    permissions: ["payments.provider", "secrets", "network"],
    author: "社群",
  });
  const service = new MarketplaceService({
    official: createMemorySource("official", signed(index([]), keys.privateKeyPem)),
    community: createMemorySource("community", signed(index([payment]), keys.privateKeyPem)),
    publicKey: keys.publicKeySpki,
    installations: createMemoryInstallations(),
    secrets: createMemorySecretStore(),
    bus: createCoreBus(),
    loader: loader([]),
  });
  const listing = await service.listing(payment.id);
  assert.equal(listing.installable, false);
  assert.equal(listing.blockReason, "payment_official_only");
  assert.equal(listing.official, false);
  await assert.rejects(() => service.install(payment.id, payment.permissions), /payment_official_only/);
});

test("a trivially safe community plugin can be recorded and is not executed", async () => {
  const keys = generateEd25519();
  const safe = plugin({
    id: "community.thanks",
    official: false,
    author: "社群",
    permissions: ["events.subscribe", "overlay.slot", "dashboard.settings"],
    kind: ["overlay", "dashboard"],
  });
  const started: string[] = [];
  const passive: PluginLoader = {
    async stage(spec) {
      started.push(spec.id);
    },
    async start(spec) {
      started.push(spec.id);
    },
  };
  const service = new MarketplaceService({
    official: createMemorySource("official", signed(index([]), keys.privateKeyPem)),
    community: createMemorySource("community", signed(index([safe]), keys.privateKeyPem)),
    publicKey: keys.publicKeySpki,
    installations: createMemoryInstallations(),
    secrets: createMemorySecretStore(),
    bus: createCoreBus(),
    loader: passive,
  });
  const installed = await service.install(safe.id, safe.permissions);
  assert.equal(installed.installed, true);
  assert.equal(installed.runtime, "metadata");
  assert.deepEqual(started, []);
});

test("plugin audit rows survive donation retention and plugins cannot emit them", async () => {
  let clock = new Date("2026-01-01T00:00:00.000Z");
  const store = createMemoryEventStore();
  const bus = createDurableBus(store, { now: () => clock });
  await bus.publish("s4n.plugin.changed", {
    action: "install",
    pluginId: "official.alerts",
    version: "0.1.0",
    previousVersion: null,
    permissions: ["events.subscribe"],
    addedPermissions: [],
    removedPermissions: [],
    source: "official",
    dataKept: null,
  });
  clock = new Date("2026-03-01T00:00:00.000Z");
  const purged = await purgeExpired(store, { chatMs: 1, defaultMs: 1 }, clock);
  assert.equal(purged.other, 0);
  assert.equal((await bus.readRecent(5)).length, 1);

  const pluginBus = createPluginBus({
    publish() {
      throw new Error("should not publish");
    },
    subscribe() {
      return () => undefined;
    },
  });
  assert.throws(() => pluginBus.emit("s4n.plugin.changed" as never, {} as never), /reserved event/);
});

test("the dashboard marketplace rejects a missing permission review", async () => {
  const { app } = createTestApp();
  const cookie = await setupOperator(app);
  const listed = await app.request("/api/marketplace", { headers: { cookie } });
  assert.equal(listed.status, 200);
  const body = (await listed.json()) as { verified: boolean; plugins: Array<{ id: string; installed: boolean; category: string }> };
  assert.equal(body.verified, true);
  assert.equal(body.plugins.length, 13);
  const ecpay = body.plugins.find((item) => item.id === "official.ecpay");
  assert.equal(ecpay?.category, "payment");
  assert.equal(ecpay?.installed, true);

  const anonymous = await app.request("/api/marketplace");
  assert.equal(anonymous.status, 401);

  const removed = await app.request("/api/marketplace/official.alerts/uninstall", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ keepData: true }),
  });
  assert.equal(removed.status, 200);

  const denied = await app.request("/api/marketplace/official.alerts/install", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ acceptedPermissions: ["events.subscribe"] }),
  });
  assert.equal(denied.status, 409);
  assert.equal(((await denied.json()) as { error: string }).error, "permissions_not_accepted");

  const installed = await app.request("/api/marketplace/official.alerts/install", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie, "content-type": "application/json" },
    body: JSON.stringify({ acceptedPermissions: ["events.subscribe", "overlay.slot"] }),
  });
  assert.equal(installed.status, 201);
});
