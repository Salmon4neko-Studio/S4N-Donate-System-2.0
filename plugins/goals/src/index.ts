import { manifest } from "./manifest.js";

export { manifest };
export {
  DEFAULT_GOAL_APPEARANCE,
  DEFAULT_GOAL_TARGET,
  DEFAULT_GOAL_TITLE,
  GOAL_TITLE_MAX,
  goalAchieved,
  goalPercent,
  goalStatuses,
  parseGoalSettings,
  plainGoalText,
  sumGoalProgress,
} from "./progress.js";
export type { GoalAppearance, GoalRow } from "./progress.js";

/** The overlay app renders the bar. Progress is computed by the core from the ledger. */
export const slot = {
  pluginId: manifest.id,
  implemented: true as const,
};
