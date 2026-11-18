import WebSocket from "ws";
import { TWITCH_IRC_URL } from "./irc.js";
import type { LineSocket } from "./session.js";

export function connectIrcWebSocket(url = TWITCH_IRC_URL): LineSocket {
  const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
  let opened = false;
  let closed = false;
  const openHandlers: Array<() => void> = [];
  const dataHandlers: Array<(chunk: string) => void> = [];
  const closeHandlers: Array<() => void> = [];

  const finish = () => {
    if (closed) return;
    closed = true;
    for (const handler of closeHandlers) handler();
  };

  ws.on("open", () => {
    opened = true;
    for (const handler of openHandlers) handler();
  });
  ws.on("message", (data) => {
    const chunk = typeof data === "string" ? data : data.toString("utf8");
    for (const handler of dataHandlers) handler(chunk);
  });
  ws.on("close", finish);
  ws.on("error", () => {
    try {
      ws.close();
    } catch {
      finish();
    }
  });

  return {
    send(data) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close() {
      try {
        ws.close();
      } catch {
        finish();
      }
      if (!opened) finish();
    },
    onOpen(handler) {
      openHandlers.push(handler);
      if (opened) handler();
    },
    onData(handler) {
      dataHandlers.push(handler);
    },
    onClose(handler) {
      closeHandlers.push(handler);
      if (closed) handler();
    },
  };
}
