import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, installDecision, permissionDiff, samePermissions } from "./policy.js";
import type { RegistryPlugin } from "./types.js";

function entry(overrides: Partial<RegistryPlugin> = {}): RegistryPlugin {
  return {
    id: "community.thanks",
    name: "感謝小卡",
    version: "0.1.0",
    api: "0.1",
    category: "overlay",
    author: "社群",
    official: false,
    description: "只有疊層。",
    icon: "bell",
    permissions: ["events.subscribe", "overlay.slot", "dashboard.settings"],
    kind: ["overlay", "dashboard"],
    changelog: "初版",
    compatibility: { core: "0.1", pluginSpec: "0.1" },
    sha256: "ab".repeat(32),
    featured: false,
    screenshots: [],
    ...overrides,
  };
}

test("payment plugins are official-only, including a signed community copy", () => {
  const payment = entry({
    id: "community.pay",
    category: "payment",
    kind: ["payment"],
    permissions: ["payments.provider", "secrets", "network"],
    icon: "credit-card",
  });
  assert.deepEqual(installDecision(payment, "community"), { allow: false, reason: "payment_official_only" });
  assert.deepEqual(installDecision({ ...payment, official: true, id: "official.ecpay" }, "community"), {
    allow: false,
    reason: "payment_official_only",
  });
  assert.deepEqual(
    installDecision(
      { ...payment, official: true, id: "official.impostor", source: undefined } as RegistryPlugin,
      "official",
    ),
    { allow: false, reason: "payment_official_only" },
  );
  assert.deepEqual(installDecision({ ...payment, official: true, id: "official.ecpay" }, "official"), {
    allow: true,
    runtime: "bundled",
  });
  assert.deepEqual(installDecision({ ...payment, official: true, id: "official.ecpay-atm" }, "official"), {
    allow: true,
    runtime: "bundled",
  });
  assert.deepEqual(installDecision({ ...payment, official: true, id: "official.ecpay-cvs" }, "community"), {
    allow: false,
    reason: "payment_official_only",
  });
  assert.deepEqual(installDecision({ ...payment, official: true, id: "official.opay-barcode" }, "official"), {
    allow: false,
    reason: "payment_official_only",
  });
});

test("a community plugin installs only with the trivial permission set", () => {
  assert.deepEqual(installDecision(entry(), "community"), { allow: true, runtime: "metadata" });
  assert.deepEqual(
    installDecision(entry({ permissions: ["events.subscribe", "events.emit"] }), "community"),
    { allow: false, reason: "community_not_installable" },
  );
  assert.deepEqual(installDecision(entry({ permissions: ["secrets"] }), "community"), {
    allow: false,
    reason: "community_not_installable",
  });
  assert.deepEqual(installDecision(entry({ permissions: ["network"] }), "community"), {
    allow: false,
    reason: "community_not_installable",
  });
  assert.deepEqual(installDecision(entry({ kind: ["connector"], category: "chat-source" }), "community"), {
    allow: false,
    reason: "community_not_installable",
  });
});

test("an official id that is not on the allowlist cannot install", () => {
  assert.deepEqual(
    installDecision(entry({ id: "official.impostor", official: true }), "official"),
    { allow: false, reason: "not_official_allowlist" },
  );
});

test("permission diff lists additions and removals", () => {
  assert.deepEqual(
    permissionDiff(["events.subscribe", "overlay.slot"], ["events.subscribe", "overlay.slot", "secrets"]),
    { added: ["secrets"], removed: [] },
  );
  assert.deepEqual(permissionDiff(["secrets"], ["events.subscribe"]), {
    added: ["events.subscribe"],
    removed: ["secrets"],
  });
  assert.equal(samePermissions(["overlay.slot", "events.subscribe"], ["events.subscribe", "overlay.slot"]), true);
  assert.equal(samePermissions(["events.subscribe", "events.subscribe"], ["events.subscribe"]), false);
});

test("versions compare as numbers", () => {
  assert.equal(compareVersions("0.1.0", "0.0.0"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.9.0", "0.10.0"), -1);
});
