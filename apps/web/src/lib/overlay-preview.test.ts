import assert from "node:assert/strict";
import { test } from "node:test";
import {
  containScale,
  MAX_STAGE_IMAGE_BYTES,
  overlayPreviewSrc,
  OVERLAY_PREVIEW_IFRAME,
  parseCanvasDimension,
  SAMPLE_STAGE_PATH,
  stageBackgroundAttr,
  stageImageRejection,
  visibleFileLabel,
} from "./overlay-preview.ts";

const PAGE = "http://localhost:5181/?token=abc-def_012&plugin=official.alerts&transparent=1&preview=1&extra=1#leak";

test("preview src is one canvas url and drops plugin and preview", () => {
  const src = overlayPreviewSrc(PAGE);
  assert.ok(src);
  const url = new URL(src);
  assert.equal(url.origin, "http://localhost:5181");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.get("token"), "abc-def_012");
  assert.equal(url.searchParams.getAll("token").length, 1);
  assert.equal(url.searchParams.get("plugin"), null);
  assert.equal(url.searchParams.get("transparent"), "1");
  assert.equal(url.searchParams.get("preview"), null);
  assert.equal(url.searchParams.get("extra"), "1");
  assert.equal(url.searchParams.has("clientId"), false);
  assert.equal(url.searchParams.has("clientSecret"), false);
  assert.equal(src.includes("#"), false);
});

test("preview src round-trips an encoded token without moving it", () => {
  const src = overlayPreviewSrc("https://overlay.example/?token=abc%2Bdef&plugin=official.chat-overlay&transparent=1");
  assert.ok(src);
  const url = new URL(src);
  assert.equal(url.searchParams.get("token"), "abc+def");
  assert.equal(url.searchParams.getAll("token").length, 1);
  assert.equal(url.searchParams.get("plugin"), null);
  assert.equal(url.hash, "");
});

test("preview src rejects unsafe urls", () => {
  assert.equal(overlayPreviewSrc("javascript:alert(1)"), null);
  assert.equal(overlayPreviewSrc("http://user:pass@localhost:5181/?token=abc"), null);
  assert.equal(overlayPreviewSrc("http://localhost:5181/?plugin=official.alerts"), null);
  assert.equal(overlayPreviewSrc("not a url"), null);
});

test("iframe sandbox does not grant navigation, popups, or forms", () => {
  assert.equal(OVERLAY_PREVIEW_IFRAME.referrerPolicy, "no-referrer");
  assert.deepEqual(OVERLAY_PREVIEW_IFRAME.sandbox.split(" ").sort(), ["allow-same-origin", "allow-scripts"]);
});

test("canvas dimensions stay inside the supported range", () => {
  assert.equal(parseCanvasDimension("1920"), 1920);
  assert.equal(parseCanvasDimension("159"), null);
  assert.equal(parseCanvasDimension("4097"), null);
  assert.equal(parseCanvasDimension("12.5"), null);
  assert.equal(parseCanvasDimension("0x10"), null);
  assert.equal(containScale(960, 540, 1920, 1080), 0.5);
  assert.equal(containScale(360, 640, 1080, 1920), 1 / 3);
  assert.equal(containScale(0, 100, 1920, 1080), 0);
});

test("stage images stay local", () => {
  const blob = "blob:http://localhost:5180/550e8400-e29b-41d4-a716-446655440000";
  assert.equal(stageBackgroundAttr("dark", blob).bg, "dark");
  assert.equal(stageBackgroundAttr("light", null).bg, "light");
  assert.equal(stageBackgroundAttr("green", null).bg, "green");
  assert.deepEqual(stageBackgroundAttr("sample", null), { bg: "image", image: SAMPLE_STAGE_PATH });
  assert.deepEqual(stageBackgroundAttr("upload", blob), { bg: "image", image: blob });
  assert.equal(stageBackgroundAttr("upload", "https://evil.example/stage.png").bg, "dark");
  assert.equal(stageBackgroundAttr("upload", 'blob:http://localhost:5180/x")').bg, "dark");
  assert.equal(stageBackgroundAttr("upload", null).bg, "dark");
});

test("uploaded file names stay text and oversized files are refused", () => {
  assert.equal(visibleFileLabel("畫面<script>\u202Epng"), "畫面<script>png");
  assert.equal(visibleFileLabel("a".repeat(120)).length, 80);
  assert.equal(stageImageRejection({ type: "image/png", size: 20 }), null);
  assert.equal(stageImageRejection({ type: "text/html", size: 20 }), "type");
  assert.equal(stageImageRejection({ type: "image/png", size: MAX_STAGE_IMAGE_BYTES + 1 }), "size");
});
