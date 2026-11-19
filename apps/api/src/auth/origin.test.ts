import assert from "node:assert/strict";
import { test } from "node:test";
import { originAllowlist } from "./origin.js";

test("the dashboard allowlist accepts localhost and 127.0.0.1 interchangeably", () => {
  const allowed = originAllowlist("http://localhost:5180");
  assert.equal(allowed.has("http://localhost:5180"), true);
  assert.equal(allowed.has("http://127.0.0.1:5180"), true);
  assert.equal(allowed.has("https://evil.example"), false);
  const both = originAllowlist("http://localhost:5180", "http://localhost:5181");
  assert.equal(both.has("http://127.0.0.1:5181"), true);
  assert.equal(both.has("https://evil.example"), false);
});
