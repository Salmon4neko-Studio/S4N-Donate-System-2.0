export const OFFICIAL_PLUGIN_IDS = [
  "official.ecpay",
  "official.opay",
  "official.alerts",
  "official.chat-overlay",
  "official.twitch-chat",
  "official.goals",
  "official.ticker",
  "official.tts",
] as const;

export type OfficialPluginId = (typeof OFFICIAL_PLUGIN_IDS)[number];

const OFFICIAL = new Set<string>(OFFICIAL_PLUGIN_IDS);

export function isOfficialPluginId(id: string): id is OfficialPluginId {
  return OFFICIAL.has(id);
}

/** The only plugins allowed to implement payment in this skeleton. */
export const PAYMENT_PLUGIN_IDS = ["official.ecpay", "official.opay"] as const;

const PAYMENT = new Set<string>(PAYMENT_PLUGIN_IDS);

export function isPaymentPluginId(id: string): boolean {
  return PAYMENT.has(id);
}
