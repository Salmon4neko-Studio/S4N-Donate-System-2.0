import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthService } from "./service.js";
import { createMemoryAuthStore } from "./store.js";
import { createTestApp, sessionCookie, setupOperator, TEST_OPERATOR, TEST_ORIGIN } from "../test/fixture.js";

const slow = { timeout: 120_000 };

test("setup creates the only operator and a later setup is refused", slow, async () => {
  const store = createMemoryAuthStore();
  const masterKey = Buffer.alloc(32, 9);
  const auth = createAuthService({ store, masterKey });
  const { app } = createTestApp({ auth, masterKey });

  const first = await app.request("/api/auth/setup", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(TEST_OPERATOR),
  });
  const created = (await first.json()) as { email?: string };
  assert.equal(first.status, 201);
  assert.equal(created.email, TEST_OPERATOR.email);
  assert.equal(JSON.stringify(created).includes("passwordHash"), false);
  assert.equal(JSON.stringify(created).includes(TEST_OPERATOR.password), false);
  const cookie = sessionCookie(first);
  assert.match(cookie, /^s4n_session=/);
  const issued = first.headers.getSetCookie().join(" ");
  assert.match(issued, /HttpOnly/i);
  assert.match(issued, /SameSite=Lax/i);
  assert.doesNotMatch(issued, /;\s*Secure(?:;|$)/i);

  const operator = await store.findOperatorByEmail(TEST_OPERATOR.email);
  assert.ok(operator);
  assert.match(operator.passwordHash, /^\$argon2id\$/);
  assert.match(operator.passwordHash, /m=19456,t=2,p=1/);
  assert.equal(operator.passwordHash.includes(TEST_OPERATOR.password), false);

  const second = await app.request("/api/auth/setup", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ email: "other@example.com", password: "another-long-password" }),
  });
  assert.equal(second.status, 409);
  assert.equal(((await second.json()) as { error?: string }).error, "setup_closed");
  assert.equal(await store.countOperators(), 1);

  const me = await app.request("/api/auth/me", { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { email?: string }).email, TEST_OPERATOR.email);
});

test("login accepts the password and rejects a wrong one without a cookie", slow, async () => {
  const { app } = createTestApp();
  await setupOperator(app);

  const bad = await app.request("/api/auth/login", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ email: TEST_OPERATOR.email, password: "wrong-password-value" }),
  });
  assert.equal(bad.status, 401);
  assert.equal(((await bad.json()) as { error?: string }).error, "invalid_credentials");
  assert.equal(bad.headers.getSetCookie().length, 0);

  const unknown = await app.request("/api/auth/login", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ email: "missing@example.com", password: "wrong-password-value" }),
  });
  assert.equal(unknown.status, 401);
  assert.equal(((await unknown.json()) as { error?: string }).error, "invalid_credentials");

  const good = await app.request("/api/auth/login", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(TEST_OPERATOR),
  });
  assert.equal(good.status, 200);
  const cookie = sessionCookie(good);
  const me = await app.request("/api/auth/me", { headers: { cookie } });
  assert.equal(me.status, 200);

  const loggedOut = await app.request("/api/auth/logout", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie },
  });
  assert.equal(loggedOut.status, 200);
  const after = await app.request("/api/auth/me", { headers: { cookie } });
  assert.equal(after.status, 401);
});

test("login rate limit trips before another password check", slow, async () => {
  const { app } = createTestApp({ loginRateLimit: { windowMs: 60_000, max: 3 } });
  await setupOperator(app);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_OPERATOR.email, password: "wrong-password-value" }),
    });
    assert.equal(response.status, 401);
  }
  const limited = await app.request("/api/auth/login", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(TEST_OPERATOR),
  });
  assert.equal(limited.status, 429);
  assert.equal(((await limited.json()) as { error?: string }).error, "rate_limited");
});

test("dashboard routes require a session and the public donate route does not", slow, async () => {
  const { app } = createTestApp();
  const paths = [
    "/api/auth/me",
    "/api/plugins",
    "/api/plugins/official.ecpay/settings",
    "/api/donations",
    "/api/overlay",
  ];
  for (const path of paths) {
    const response = await app.request(path);
    assert.equal(response.status, 401, path);
    assert.equal(((await response.json()) as { error?: string }).error, "session_required");
  }

  const health = await app.request("/api/health");
  assert.equal(health.status, 200);

  const donate = await app.request("/api/donations", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:5180", "content-type": "application/json" },
    body: JSON.stringify({
      pluginId: "official.ecpay",
      amountMinor: 100,
      currency: "TWD",
      donorName: "小光",
      message: "謝謝",
    }),
  });
  assert.equal(donate.status, 501);

  const enabled = await app.request("/api/plugins/community.weather/enabled", {
    method: "PUT",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabled.status, 401);
});

test("production session cookies are Secure and expired sessions are rejected", slow, async () => {
  const production = createTestApp({ envName: "production" });
  const created = await production.app.request("/api/auth/setup", {
    method: "POST",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(TEST_OPERATOR),
  });
  assert.equal(created.status, 201);
  assert.match(created.headers.getSetCookie().join(" "), /;\s*Secure(?:;|$)/i);

  const expired = createTestApp({ sessionTtlMs: 0 });
  const cookie = await setupOperator(expired.app);
  const me = await expired.app.request("/api/auth/me", { headers: { cookie } });
  assert.equal(me.status, 401);
});

test("a session id is rotated and the previous cookie stops working", slow, async () => {
  const { app } = createTestApp({ rotateAfterMs: 0 });
  const cookie = await setupOperator(app);
  const me = await app.request("/api/auth/me", { headers: { cookie } });
  assert.equal(me.status, 200);
  const rotated = sessionCookie(me);
  assert.notEqual(rotated, cookie);
  const stale = await app.request("/api/auth/me", { headers: { cookie } });
  assert.equal(stale.status, 401);
  const current = await app.request("/api/auth/me", { headers: { cookie: rotated } });
  assert.equal(current.status, 200);
});
