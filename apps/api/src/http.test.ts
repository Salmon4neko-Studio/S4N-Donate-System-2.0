import assert from "node:assert/strict";
import { test } from "node:test";
import { clientKey, forwardedRequest } from "./http.js";

test("a trusted proxy keeps only the last forwarded hop", () => {
  assert.equal(clientKey(undefined, true), "local");
  assert.equal(clientKey("203.0.113.8", true), "203.0.113.8");
  assert.equal(clientKey("1.1.1.1, 203.0.113.8", true), "203.0.113.8");
  assert.equal(clientKey("1.1.1.1, 203.0.113.8"), "1.1.1.1, 203.0.113.8");
  assert.equal(clientKey(undefined), "local");
});

test("forwarded proto and host replace the internal request URL", async () => {
  const internal = new Request("http://api:8787/api/health", {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "donate.example",
    },
  });
  const next = forwardedRequest(internal);
  assert.equal(next.url, "https://donate.example/api/health");

  const spoofed = new Request("http://api:8787/api/payments/official.ecpay/callback", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-proto": "http, https",
      "x-forwarded-host": "evil.example, donate.example",
    },
    body: "MerchantID=1",
  });
  const trusted = forwardedRequest(spoofed);
  assert.equal(trusted.url, "https://donate.example/api/payments/official.ecpay/callback");
  assert.equal(await trusted.text(), "MerchantID=1");

  const direct = new Request("http://127.0.0.1:8787/api/health");
  assert.equal(forwardedRequest(direct).url, direct.url);
});
