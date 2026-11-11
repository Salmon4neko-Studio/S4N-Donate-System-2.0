import { manifest } from "./manifest.js";

export { manifest };
export { alertDurationMs, readDonationAlert, visibleUntrusted } from "./alert.js";
export type { DonationAlert } from "./alert.js";

/** The overlay app imports readDonationAlert. Goals, ticker, and TTS stay stubs. */
export const slot = {
  pluginId: manifest.id,
  implemented: true as const,
};
