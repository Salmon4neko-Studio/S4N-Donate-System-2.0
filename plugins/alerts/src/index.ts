import { manifest } from "./manifest.js";

export { manifest };
export { alertDurationMs, readDonationAlert, visibleUntrusted } from "./alert.js";
export type { DonationAlert } from "./alert.js";
export {
  ALERT_BODY_MAX,
  ALERT_EXIT_MS,
  ALERT_MOTIONS,
  ALERT_TEMPLATE_NAMES,
  ALERT_TITLE_MAX,
  DEFAULT_ALERT_APPEARANCE,
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_TITLE_TEMPLATE,
  alertExitHoldMs,
  alertTemplateValues,
  formatAlertAmount,
  isAlertMotion,
  isAlertSoundName,
  parseAlertAppearance,
  renderAlertCopy,
  renderAlertTemplate,
} from "./appearance.js";
export type { AlertAppearance, AlertMotion } from "./appearance.js";

/** The overlay app imports readDonationAlert and plays the uploaded sound. */
export const slot = {
  pluginId: manifest.id,
  implemented: true as const,
};
