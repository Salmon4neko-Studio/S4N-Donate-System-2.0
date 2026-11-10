import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_MASTER_KEY, parseMasterKey } from "./master-key.js";

test("development accepts the public all-zero key", () => {
  const key = parseMasterKey(DEV_MASTER_KEY, "development");
  assert.equal(key.length, 32);
  assert.ok(key.equals(Buffer.alloc(32)));
});

test("production rejects the all-zero key", () => {
  assert.throws(() => parseMasterKey(DEV_MASTER_KEY, "production"), /all-zero/);
});

test("rejects keys that are not 32 bytes", () => {
  assert.throws(() => parseMasterKey(Buffer.alloc(16).toString("base64"), "development"), /32 bytes/);
});
