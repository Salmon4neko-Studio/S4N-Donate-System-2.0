import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ALERT_SOUND_FIELD, ALERT_SOUND_MAX_BYTES, createAlertSoundStore, inspectAlertSound, safeSoundPath } from "./sound.js";
import { createTestApp, setupOperator, TEST_ORIGIN } from "../test/fixture.js";

const WAV = Buffer.from("RIFF$\0\0\0WAVEfmt ", "latin1");
const OGG = Buffer.from("OggSrest-of-page", "latin1");
const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);

test("alert sounds accept matching headers and reject forgeries, size, and paths", async () => {
  assert.equal(inspectAlertSound(WAV, "audio/wav").ok, true);
  assert.equal(inspectAlertSound(OGG, "audio/ogg").ok, true);
  assert.equal(inspectAlertSound(MP3, "audio/mpeg").ok, true);
  assert.equal(inspectAlertSound(MP3, "audio/mp3").ok, true);

  assert.deepEqual(inspectAlertSound(Buffer.from("not audio"), "audio/mpeg"), { ok: false, reason: "invalid" });
  assert.deepEqual(inspectAlertSound(WAV, "audio/mpeg"), { ok: false, reason: "invalid" });
  assert.deepEqual(inspectAlertSound(WAV, "application/octet-stream"), { ok: false, reason: "invalid" });
  const huge = Buffer.concat([WAV, Buffer.alloc(ALERT_SOUND_MAX_BYTES)]);
  assert.deepEqual(inspectAlertSound(huge, "audio/wav"), { ok: false, reason: "too_large" });

  const dir = await mkdtemp(join(tmpdir(), "s4n-sound-"));
  const outside = join(dir, "..", "secret.wav");
  await writeFile(outside, WAV);
  assert.equal(safeSoundPath(dir, "../secret.wav"), null);
  assert.equal(safeSoundPath(dir, "..\\secret.wav"), null);
  assert.equal(safeSoundPath(dir, "/etc/passwd"), null);
  assert.equal(safeSoundPath(dir, "not-a-sound.mp3"), null);
  assert.equal(safeSoundPath(dir, `${"a".repeat(32)}.mp3/../../secret.wav`), null);

  const store = createAlertSoundStore(dir);
  const saved = await store.save(WAV, "audio/wav");
  assert.ok("name" in saved);
  if (!("name" in saved)) return;
  assert.match(saved.name, /^[a-f0-9]{32}\.wav$/);
  assert.equal(saved.name.includes("secret"), false);
  const read = await store.read(saved.name);
  assert.equal(read?.contentType, "audio/wav");
  assert.equal(await store.read("../secret.wav"), null);
  assert.equal(await store.read(`${"a".repeat(32)}.wav`), null);
  const forged = await store.save(WAV, "audio/mpeg");
  assert.deepEqual(forged, { error: "invalid" });
});

test("the sound route rejects bad uploads and serves a random name only with the overlay token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "s4n-sound-http-"));
  const fixture = createTestApp({ alertSounds: createAlertSoundStore(dir) });
  const cookie = await setupOperator(fixture.app);
  const headers = { origin: TEST_ORIGIN, cookie };

  const bad = await fixture.app.request("/api/plugins/official.alerts/sound", {
    method: "POST",
    headers,
    body: form(Buffer.from("hello"), "audio/mpeg", "../../etc/passwd.mp3"),
  });
  assert.equal(bad.status, 422);

  const forged = await fixture.app.request("/api/plugins/official.alerts/sound", {
    method: "POST",
    headers,
    body: form(WAV, "audio/mpeg", "clip.mp3"),
  });
  assert.equal(forged.status, 422);

  const huge = Buffer.concat([WAV, Buffer.alloc(ALERT_SOUND_MAX_BYTES)]);
  const oversized = await fixture.app.request("/api/plugins/official.alerts/sound", {
    method: "POST",
    headers,
    body: form(huge, "audio/wav", "big.wav"),
  });
  assert.equal(oversized.status, 422);

  const uploaded = await fixture.app.request("/api/plugins/official.alerts/sound", {
    method: "POST",
    headers,
    body: form(WAV, "audio/wav", "../escape.wav"),
  });
  assert.equal(uploaded.status, 200);
  const stored = await fixture.secrets.readPublicSettings("official.alerts");
  const name = stored[ALERT_SOUND_FIELD];
  assert.equal(typeof name, "string");
  assert.match(String(name), /^[a-f0-9]{32}\.wav$/);
  assert.equal(String(name).includes("escape"), false);
  assert.equal(JSON.stringify(await uploaded.json()).includes("escape"), false);

  const anonymous = await fixture.app.request("/api/overlay/alerts/sound");
  assert.equal(anonymous.status, 401);
  const issued = await fixture.app.request("/api/overlay/token", { method: "POST", headers });
  const token = new URL(((await issued.json()) as { url: string }).url).searchParams.get("token");
  assert.ok(token);
  const played = await fixture.app.request(`/api/overlay/alerts/sound?token=${encodeURIComponent(token ?? "")}`, {
    headers: { cookie: "s4n_session=not-used" },
  });
  assert.equal(played.status, 200);
  assert.equal(played.headers.get("content-type"), "audio/wav");
  const traversed = await fixture.app.request(
    `/api/overlay/alerts/sound?token=${encodeURIComponent(token ?? "")}&file=../secret.wav`,
  );
  assert.equal(traversed.status, 200);
  assert.equal(traversed.headers.get("content-type"), "audio/wav");

  const removed = await fixture.app.request("/api/plugins/official.alerts/sound", { method: "DELETE", headers });
  assert.equal(removed.status, 200);
  const after = await fixture.secrets.readPublicSettings("official.alerts");
  assert.equal(after[ALERT_SOUND_FIELD], undefined);
  const missing = await fixture.app.request(`/api/overlay/alerts/sound?token=${encodeURIComponent(token ?? "")}`);
  assert.equal(missing.status, 404);
});

function form(bytes: Buffer, mime: string, filename: string): FormData {
  const body = new FormData();
  body.append("file", new File([bytes], filename, { type: mime }));
  return body;
}
