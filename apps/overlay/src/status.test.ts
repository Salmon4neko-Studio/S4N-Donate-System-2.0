import assert from "node:assert/strict";
import { test } from "node:test";
import { overlayStatusLine } from "./status.ts";

test("the official overlay url renders no connection status", () => {
  for (const kind of ["alerts", "chat", "goals", "ticker", "stage-denied", "stage-empty"] as const) {
    assert.equal(overlayStatusLine({ preview: false, kind, connection: "open", idle: true }), null);
    assert.equal(overlayStatusLine({ preview: false, kind, connection: "connecting", idle: true }), null);
    assert.equal(overlayStatusLine({ preview: false, kind, connection: "denied", idle: true }), null);
  }
});

test("a missing transparent flag still hides status outside preview", () => {
  assert.equal(overlayStatusLine({ preview: false, kind: "alerts", connection: "open", idle: true }), null);
  assert.equal(overlayStatusLine({ preview: false, kind: "chat", connection: "open", idle: true }), null);
  const official = overlayStatusLine({ preview: false, kind: "alerts", connection: "open", idle: true });
  assert.equal(official, null);
  assert.equal(String(official ?? "").includes("等待贊助"), false);
  assert.equal(String(official ?? "").includes("已連線"), false);
});

test("preview mode may show the waiting lines", () => {
  assert.equal(
    overlayStatusLine({ preview: true, kind: "alerts", connection: "open", idle: true }),
    "贊助提醒已連線。等待贊助。",
  );
  assert.equal(
    overlayStatusLine({ preview: true, kind: "chat", connection: "open", idle: true }),
    "聊天疊層已連線。等待訊息。",
  );
  assert.equal(overlayStatusLine({ preview: true, kind: "alerts", connection: "open", idle: false }), null);
  assert.equal(overlayStatusLine({ preview: true, kind: "goals", connection: "open", idle: true }), null);
});
