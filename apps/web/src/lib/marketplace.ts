export const categoryLabel: Record<string, string> = {
  payment: "金流",
  overlay: "疊層",
  "chat-source": "聊天室來源",
  tool: "工具",
};

export const permissionCopy: Record<string, { label: string; detail: string }> = {
  "events.subscribe": { label: "訂閱事件", detail: "可以收到核心送出的事件。" },
  "events.emit": { label: "發送事件", detail: "可以送出事件，但不能偽造贊助入帳。" },
  "overlay.slot": { label: "疊層版位", detail: "可以在 OBS 佔一個畫面。" },
  "dashboard.settings": { label: "儀表板設定", detail: "可以在儀表板保存這個外掛的設定。" },
  "tts.speak": { label: "語音", detail: "可以請求朗讀。這個版本還沒有合成器。" },
  "payments.read": { label: "讀取付款", detail: "可以讀取付款資料。這個版本沒有讀取 API。" },
  "payments.provider": { label: "付款提供者", detail: "可以建立付款並驗證回呼。仍然不能寫帳。" },
  secrets: { label: "密鑰", detail: "設定裡可以有密文。畫面只會顯示已設定或未設定。" },
  network: { label: "對外網路", detail: "可以向金流或平台連線。" },
};

export const blockCopy: Record<string, string> = {
  payment_official_only: "金流外掛只接受官方目錄裡的綠界與歐付寶。",
  community_not_installable: "這個版本不安裝需要額外權限的社群外掛。",
  not_official_allowlist: "這份清單不在官方允許清單上。",
  incompatible: "它和目前的核心或外掛規格不相容。",
  permissions_not_accepted: "請先看完這次要授予的權限。",
  version_pinned: "這個版本已釘選，要先取消釘選才能更新。",
  update_rolled_back: "新版本沒有載入，已回到原本的版本。",
  package_integrity: "套件摘要與簽過名的索引不一致，已拒絕。",
  already_installed: "這個外掛已經安裝。",
  not_installed: "這個外掛目前沒有安裝。",
  registry_untrusted: "官方索引沒有通過簽章檢查。",
};

export function marketplaceError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return blockCopy[body.error] ?? fallback;
  }
  return fallback;
}
