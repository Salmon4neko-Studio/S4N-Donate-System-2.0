import { manifest } from "./manifest.js";

export { manifest };
export {
  DEFAULT_TICKER,
  TICKER_ITEM_MAX,
  TICKER_LINE_MAX,
  buildTickerLine,
  parseTickerSettings,
  plainTickerText,
  tickerCustomItems,
  tickerDonationItem,
  tickerDurationSec,
} from "./text.js";
export type { TickerAppearance, TickerDirection, TickerDonation } from "./text.js";

/** The overlay app scrolls the line the core already sanitized. */
export const slot = {
  pluginId: manifest.id,
  implemented: true as const,
};
