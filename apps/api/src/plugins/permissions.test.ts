import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPermissionsAllowed, COMMUNITY_DEFAULT_PERMISSIONS } from "@s4n/plugin-sdk";
import { OFFICIAL_PLUGIN_IDS } from "./official.js";

test("community plugins cannot request official-only permissions", () => {
  assert.throws(() => assertPermissionsAllowed("community.weather", ["secrets"], OFFICIAL_PLUGIN_IDS));
  assert.throws(() =>
    assertPermissionsAllowed("community.weather", ["payments.provider"], OFFICIAL_PLUGIN_IDS),
  );
  assert.throws(() => assertPermissionsAllowed("community.weather", ["network"], OFFICIAL_PLUGIN_IDS));
  assert.doesNotThrow(() =>
    assertPermissionsAllowed("community.weather", COMMUNITY_DEFAULT_PERMISSIONS, OFFICIAL_PLUGIN_IDS),
  );
});

test("the official allowlist is explicit, not a name prefix", () => {
  assert.throws(() =>
    assertPermissionsAllowed("official.impostor", ["secrets"], OFFICIAL_PLUGIN_IDS),
  );
});
