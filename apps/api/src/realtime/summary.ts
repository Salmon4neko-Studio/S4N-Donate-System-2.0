import type { DeliveredEvent } from "./bus.js";

const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

export interface EventLogEntry {
  sequence: string;
  id: string;
  type: string;
  occurredAt: string;
  summary: string;
}

/** Operator-facing line. Control characters are removed. The text is not HTML. */
export function toEventLogEntry(event: DeliveredEvent): EventLogEntry {
  return {
    sequence: event.sequence,
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    summary: summarizeEvent(event),
  };
}

export function summarizeEvent(event: DeliveredEvent): string {
  switch (event.type) {
    case "s4n.donation.created":
      return clip(`建立訂單 · ${plain(event.payload.donorName, 40)} · ${money(event.payload.amountMinor, event.payload.currency)}`);
    case "s4n.donation.succeeded":
      return clip(`贊助入帳 · ${plain(event.payload.donorName, 40)} · ${money(event.payload.amountMinor, event.payload.currency)}`);
    case "s4n.donation.failed":
      return clip(`贊助未成功 · ${failureLabel(event.payload.reason)}`);
    case "s4n.donation.test":
      return clip(`測試贊助 · ${plain(event.payload.donorName, 40)} · ${money(event.payload.amountMinor, event.payload.currency)}`);
    case "s4n.chat.message":
      return clip(`聊天 · ${plain(event.payload.displayName, 40)}：${plain(event.payload.text, 80)}`);
    case "s4n.chat.delete":
      return "刪除聊天訊息";
    case "s4n.chat.clear":
      return event.payload.userId === undefined ? "清空聊天" : "清除一位觀眾的聊天";
    case "s4n.goal.updated":
      return clip(`目標 · ${plain(event.payload.title, 40)}`);
    case "s4n.tts.request":
      return clip(`語音 · ${plain(event.payload.text, 80)}`);
    case "s4n.media.now_playing":
      return clip(`正在播放 · ${plain(event.payload.title, 60)}`);
    case "s4n.plugin.changed":
      return clip(pluginChangeSummary(event.payload));
    default: {
      const unexpected: never = event;
      return clip(String(unexpected));
    }
  }
}

function pluginChangeSummary(payload: {
  action: string;
  pluginId: string;
  version: string;
  addedPermissions: readonly string[];
}): string {
  const action = pluginActionLabel(payload.action);
  const added = payload.addedPermissions.length > 0 ? ` · 新增權限 ${payload.addedPermissions.join("、")}` : "";
  return `${action} · ${plain(payload.pluginId, 48)} · ${plain(payload.version, 16)}${added}`;
}

function pluginActionLabel(action: string): string {
  switch (action) {
    case "install":
      return "安裝外掛";
    case "update":
      return "更新外掛";
    case "uninstall":
      return "移除外掛";
    case "enable":
      return "啟用外掛";
    case "disable":
      return "停用外掛";
    case "rollback":
      return "外掛回到上一版";
    case "pin":
      return "釘選外掛版本";
    case "unpin":
      return "取消釘選外掛";
    default:
      return "變更外掛";
  }
}

function failureLabel(reason: string): string {
  switch (reason) {
    case "verification_failed":
      return "驗證沒有通過";
    case "declined":
      return "交易沒有成功";
    case "expired":
      return "逾時";
    default:
      return "未知原因";
  }
}

function money(amountMinor: number, currency: string): string {
  if (currency === "TWD") return `${amountMinor} 元`;
  return `${amountMinor} ${plain(currency, 8)}`;
}

function plain(value: string, max: number): string {
  return value.replace(HIDDEN, "").slice(0, max);
}

function clip(value: string): string {
  return value.length > 140 ? `${value.slice(0, 139)}…` : value;
}
