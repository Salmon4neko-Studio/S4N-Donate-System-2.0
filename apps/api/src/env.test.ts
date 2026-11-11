import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnv } from "./env.js";

const master = { S4N_MASTER_KEY: "local-test-key" };

test("development defaults the public callback origin and donation bounds", () => {
  const env = loadEnv({ ...master, S4N_ENV: "development" });
  assert.equal(env.publicBaseUrl, "http://127.0.0.1:8787");
  assert.equal(env.donationMin, 30);
  assert.equal(env.donationMax, 20_000);
});

test("production requires a bare public origin", () => {
  const database = { DATABASE_URL: "postgresql://s4n:s4n@localhost:5432/s4n" };
  assert.throws(
    () => loadEnv({ ...master, ...database, S4N_ENV: "production" }),
    /S4N_PUBLIC_BASE_URL/,
  );
  assert.throws(
    () =>
      loadEnv({
        ...master,
        ...database,
        S4N_ENV: "production",
        S4N_PUBLIC_BASE_URL: "https://donate.example/api",
      }),
    /S4N_PUBLIC_BASE_URL/,
  );
  const env = loadEnv({
    ...master,
    S4N_ENV: "production",
    S4N_PUBLIC_BASE_URL: "https://donate.example",
    DATABASE_URL: "postgresql://s4n:s4n@localhost:5432/s4n",
  });
  assert.equal(env.publicBaseUrl, "https://donate.example");
});

test("donation bounds must be ordered integers", () => {
  assert.throws(
    () => loadEnv({ ...master, S4N_DONATION_MIN_TWD: "100", S4N_DONATION_MAX_TWD: "50" }),
    /S4N_DONATION_MIN_TWD/,
  );
  assert.throws(() => loadEnv({ ...master, S4N_DONATION_MAX_TWD: "10.5" }), /S4N_DONATION_MAX_TWD/);
});
