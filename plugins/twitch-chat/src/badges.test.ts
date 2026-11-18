import assert from "node:assert/strict";
import { test } from "node:test";
import { createBadgeCache } from "./badges.js";

const CREDS = { clientId: "client-test", clientSecret: "super-secret-value" };

test("badge images are cached from Helix and foreign image URLs are dropped", async () => {
  let clock = 1_000_000;
  const calls: Array<{ url: string; body: string; authorization: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
    calls.push({ url, body, authorization: headers.get("authorization") ?? "" });
    if (url.endsWith("/oauth2/token")) {
      return json({ access_token: "token-1", expires_in: 3600 });
    }
    if (url.endsWith("/badges/global")) {
      return json({
        data: [
          {
            set_id: "moderator",
            versions: [
              {
                id: "1",
                title: "Moderator",
                image_url_2x: "https://static-cdn.jtvnw.net/badges/v1/mod/2",
              },
            ],
          },
        ],
      });
    }
    if (url.includes("broadcaster_id=99")) {
      return json({
        data: [
          {
            set_id: "custom",
            versions: [{ id: "1", title: "Custom", image_url_1x: "https://evil.example/badge.png" }],
          },
        ],
      });
    }
    return new Response("no", { status: 404 });
  };

  const cache = createBadgeCache({ fetchImpl, now: () => clock, ttlMs: 1_000 });
  assert.equal(cache.lookup("99", "moderator", "1"), null);
  await cache.refresh(CREDS, null);
  assert.deepEqual(cache.lookup("99", "moderator", "1"), {
    title: "管理員",
    imageUrl: "https://static-cdn.jtvnw.net/badges/v1/mod/2",
  });
  const afterGlobal = calls.length;
  await cache.refresh(CREDS, null);
  assert.equal(calls.length, afterGlobal);

  clock += 2_000;
  await cache.refresh(CREDS, "99");
  assert.deepEqual(cache.lookup("99", "custom", "1"), { title: "Custom" });
  assert.equal(cache.lookup("99", "custom", "1")?.imageUrl, undefined);

  const tokenCalls = calls.filter((call) => call.url.includes("oauth2/token"));
  assert.equal(tokenCalls.length >= 1, true);
  assert.equal(tokenCalls.every((call) => call.body.includes("super-secret-value")), true);
  const otherCalls = calls.filter((call) => !call.url.includes("oauth2/token"));
  assert.equal(otherCalls.every((call) => !call.url.includes("super-secret-value")), true);
  assert.equal(otherCalls.every((call) => !call.body.includes("super-secret-value")), true);
  assert.equal(otherCalls.every((call) => call.authorization === "Bearer token-1"), true);
});

test("a failed token request does not throw", async () => {
  const cache = createBadgeCache({
    fetchImpl: async () => new Response("no", { status: 401 }),
  });
  await cache.refresh(CREDS, null);
  assert.equal(cache.lookup("1", "moderator", "1"), null);
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
