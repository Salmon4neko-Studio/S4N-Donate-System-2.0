import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const entrypoint = join(import.meta.dirname, "entrypoint.sh");

function render(env: Record<string, string>): { status: number; caddyfile: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "s4n-caddy-"));
  const caddyfile = join(dir, "Caddyfile");
  try {
    writeFileSync(
      join(dir, "caddy"),
      "#!/bin/sh\nexit 0\n",
      { mode: 0o755 },
    );
    const child = spawnSync("/bin/sh", [entrypoint], {
      env: {
        PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
        S4N_CADDYFILE: caddyfile,
        ...env,
      },
      encoding: "utf8",
    });
    const written = child.status === 0 ? readFileSync(caddyfile, "utf8") : "";
    return { status: child.status ?? 1, caddyfile: written, stderr: child.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const hosts = {
  S4N_DOMAIN: "donate.example",
  S4N_OVERLAY_HOST: "overlay.donate.example",
};

test("acme still terminates TLS itself and does not trust a front proxy", () => {
  const acme = render({ ...hosts, S4N_TLS_MODE: "acme", S4N_ACME_EMAIL: "ops@example.com" });
  assert.equal(acme.status, 0, acme.stderr);
  assert.match(acme.caddyfile, /email ops@example.com/);
  assert.match(acme.caddyfile, /^donate\.example \{$/m);
  assert.match(acme.caddyfile, /header_up X-Real-IP \{remote_host\}/);
  assert.doesNotMatch(acme.caddyfile, /auto_https off/);
  assert.doesNotMatch(acme.caddyfile, /trusted_proxies/);
  assert.doesNotMatch(acme.caddyfile, /header_up X-Forwarded-For/);
  assert.doesNotMatch(acme.caddyfile, /http:\/\//);
  assert.match(render({ ...hosts, S4N_TLS_MODE: "acme" }).stderr, /S4N_ACME_EMAIL/);
});

test("internal TLS stays on the site block", () => {
  const internal = render({ ...hosts, S4N_TLS_MODE: "internal", S4N_ACME_EMAIL: "ops@example.com" });
  assert.equal(internal.status, 0, internal.stderr);
  assert.match(internal.caddyfile, /tls internal/);
  assert.doesNotMatch(internal.caddyfile, /Strict-Transport-Security/);
  assert.doesNotMatch(internal.caddyfile, /trusted_proxies/);
});

test("proxy and off listen on HTTP and collapse the forwarded client to one address", () => {
  for (const mode of ["proxy", "off"] as const) {
    const rendered = render({ ...hosts, S4N_TLS_MODE: mode, S4N_DOCS_HOST: "docs.donate.example" });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.match(rendered.caddyfile, /auto_https off/);
    assert.match(rendered.caddyfile, /trusted_proxies static private_ranges/);
    assert.match(rendered.caddyfile, /trusted_proxies_strict/);
    assert.match(rendered.caddyfile, /http:\/\/donate\.example \{/);
    assert.match(rendered.caddyfile, /http:\/\/overlay\.donate\.example \{/);
    assert.match(rendered.caddyfile, /http:\/\/docs\.donate\.example \{/);
    assert.match(rendered.caddyfile, /header_up X-Forwarded-For \{http\.vars\.client_ip\}/);
    assert.match(rendered.caddyfile, /header_up X-Real-IP \{http\.vars\.client_ip\}/);
    assert.match(rendered.caddyfile, /header_up X-Forwarded-Proto https/);
    assert.doesNotMatch(rendered.caddyfile, /header_up X-Forwarded-Host/);
    assert.match(rendered.caddyfile, /Strict-Transport-Security/);
    assert.doesNotMatch(rendered.caddyfile, /email /);
    assert.doesNotMatch(rendered.caddyfile, /tls internal/);
    assert.match(rendered.caddyfile, /reverse_proxy api:8787/);
    assert.match(rendered.caddyfile, /reverse_proxy web:8080/);
    assert.match(rendered.caddyfile, /reverse_proxy overlay:8080/);
    assert.match(rendered.caddyfile, /reverse_proxy docs:8080/);
    assert.match(rendered.caddyfile, /@s4n_ws path \/ws/);
  }
});

test("proxy mode rejects a bad hostname and an unknown TLS mode", () => {
  assert.notEqual(render({ ...hosts, S4N_TLS_MODE: "proxy", S4N_DOMAIN: "donate.example/api" }).status, 0);
  assert.notEqual(
    render({ S4N_DOMAIN: "donate.example", S4N_OVERLAY_HOST: "donate.example", S4N_TLS_MODE: "proxy" }).status,
    0,
  );
  assert.match(render({ ...hosts, S4N_TLS_MODE: "redirect" }).stderr, /S4N_TLS_MODE/);
});
