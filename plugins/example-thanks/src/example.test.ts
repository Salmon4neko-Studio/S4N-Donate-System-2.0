import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { asUntrustedText, type S4nEvent } from "s4n-donate-system-2.0-events";
import {
  assertPermissionsAllowed,
  COMMUNITY_DEFAULT_PERMISSIONS,
  createPluginBus,
  parseManifest,
} from "s4n-donate-system-2.0-plugin-sdk";
import { manifest } from "./manifest.js";
import { shouldShow, watchDonations } from "./overlay.js";

const here = dirname(fileURLToPath(import.meta.url));

test("s4n-plugin.json matches the typed manifest and stays a community overlay", () => {
  const json = JSON.parse(readFileSync(resolve(here, "../s4n-plugin.json"), "utf8")) as unknown;
  assert.deepEqual(parseManifest(json), parseManifest(manifest));
  assert.equal(manifest.api, "0.1");
  const permissions = manifest.permissions as readonly string[];
  assert.equal(permissions.includes("payments.provider"), false);
  assert.equal(permissions.includes("secrets"), false);
  assert.equal(permissions.includes("network"), false);
  for (const permission of manifest.permissions) {
    assert.equal(
      (COMMUNITY_DEFAULT_PERMISSIONS as readonly string[]).includes(permission),
      true,
      permission,
    );
  }
  assert.doesNotThrow(() => assertPermissionsAllowed(manifest.id, manifest.permissions, ["official.alerts"]));
});

test("a replayed event id is not shown twice and the cursor only moves forward", () => {
  const first = shouldShow([], "evt-1", null, "4");
  assert.equal(first.show, true);
  assert.equal(first.cursor, "4");
  const again = shouldShow(first.seen, "evt-1", first.cursor, "4");
  assert.equal(again.show, false);
  assert.equal(again.cursor, "4");
  const older = shouldShow(again.seen, "evt-2", again.cursor, "3");
  assert.equal(older.show, true);
  assert.equal(older.cursor, "4");
});

test("the example subscribes through the plugin bus and cannot emit a payment event", () => {
  const seen: string[] = [];
  const bus = createPluginBus({
    publish() {
      throw new Error("community example must not publish");
    },
    subscribe(type, handler) {
      if (type === "s4n.donation.test") {
        const event: S4nEvent<"s4n.donation.test"> = {
          type,
          id: "evt-1",
          occurredAt: "2026-01-01T00:00:00.000Z",
          payload: {
            donationId: "test_1",
            providerId: "s4n.test",
            amountMinor: 100,
            currency: "TWD",
            donorName: asUntrustedText("夜雨"),
            message: asUntrustedText("謝謝"),
            test: true,
          },
        };
        (handler as (value: S4nEvent<"s4n.donation.test">) => void)(event);
      }
      return () => undefined;
    },
  });
  const stop = watchDonations(bus, (event) => {
    seen.push(event.id);
  });
  assert.deepEqual(seen, ["evt-1"]);
  const emit = bus.emit as (type: string, payload: unknown) => void;
  assert.throws(() => emit("s4n.donation.test", { donationId: "t" }), /cannot emit/);
  assert.throws(() => emit("s4n.donation.succeeded", { donationId: "d" }), /cannot emit/);
  stop();
});
