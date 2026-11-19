export const ALERTS_PLUGIN_ID = "official.alerts";
export const CHAT_OVERLAY_PLUGIN_ID = "official.chat-overlay";

/** One OBS browser source. The page renders every enabled plugin that declares overlaySlot. */
export function overlayPageUrl(origin: string, token: string): string {
  const url = new URL(origin);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("token", token);
  url.searchParams.set("transparent", "1");
  return url.toString();
}
