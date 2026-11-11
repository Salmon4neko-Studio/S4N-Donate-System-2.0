export const ALERTS_PLUGIN_ID = "official.alerts";

export function overlayPageUrl(origin: string, token: string, pluginId = ALERTS_PLUGIN_ID): string {
  const url = new URL(origin);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("token", token);
  url.searchParams.set("plugin", pluginId);
  url.searchParams.set("transparent", "1");
  return url.toString();
}
