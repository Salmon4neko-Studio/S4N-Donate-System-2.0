import type { Ledger } from "../payments/ledger.js";
import { goalStatuses, parseGoalSettings } from "@s4n/plugin-goals";
import { buildTickerLine, parseTickerSettings } from "@s4n/plugin-ticker";
import type { InstallationStore } from "../plugins/installations.js";
import type { SecretStore } from "../plugins/settings.js";
import type { CoreBus } from "./bus.js";

export const GOALS_PLUGIN_ID = "official.goals";
export const TICKER_PLUGIN_ID = "official.ticker";

/**
 * Settings sent to an overlay socket. Stored values stay as the operator saved them.
 * Goal progress and the ticker line are computed here and are not written back.
 */
export async function decorateOverlaySettings(
  pluginId: string,
  settings: Record<string, string | number | boolean>,
  ledger: Ledger,
): Promise<Record<string, string | number | boolean>> {
  try {
    if (pluginId === GOALS_PLUGIN_ID) {
      const currentMinor = await goalCurrent(ledger, settings);
      return { ...withoutRetiredGoalFields(settings), currentMinor };
    }
    if (pluginId === TICKER_PLUGIN_ID) {
      const appearance = parseTickerSettings(settings);
      const recent = appearance.includeDonations
        ? await ledger.listPaidRecent(appearance.donationCount, "TWD")
        : [];
      const marquee = buildTickerLine(
        settings,
        recent.map((row) => ({
          donorName: row.donorName,
          amountMinor: row.amountMinor,
          currency: row.currency,
          message: row.message,
        })),
      );
      return { ...settings, marquee };
    }
  } catch {
    return settings;
  }
  return settings;
}

export async function publishGoalProgress(deps: {
  ledger: Ledger;
  secrets: SecretStore;
  installations: InstallationStore;
  bus: CoreBus;
}): Promise<void> {
  const enabled = await deps.installations.enabledIds();
  if (!enabled.has(GOALS_PLUGIN_ID)) return;
  const settings = await deps.secrets.readPublicSettings(GOALS_PLUGIN_ID);
  const appearance = parseGoalSettings(settings);
  const currentMinor = await goalCurrent(deps.ledger, settings);
  await deps.bus.publish("s4n.goal.updated", {
    goalId: GOALS_PLUGIN_ID,
    title: appearance.title,
    currentMinor,
    targetMinor: appearance.targetMinor,
    currency: "TWD",
  });
}

async function goalCurrent(ledger: Ledger, settings: Record<string, unknown>): Promise<number> {
  const appearance = parseGoalSettings(settings);
  return ledger.sumPaid({
    statuses: goalStatuses(),
    since: appearance.since,
    currency: "TWD",
  });
}

/** Remove a previously stored switch. Missing rows and write failures stay quiet at startup. */
export async function forgetRetiredGoalSetting(secrets: SecretStore, version: string): Promise<void> {
  const current = await secrets.readPublicSettings(GOALS_PLUGIN_ID);
  if (!("creditedOnly" in current)) return;
  await secrets.write(GOALS_PLUGIN_ID, {
    version,
    publicSettings: withoutRetiredGoalFields(current),
    secrets: {},
  });
}

/** Drop a retired switch. Callers that still have it stored must not fail. */
export function withoutRetiredGoalFields(
  settings: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  if (!("creditedOnly" in settings)) return settings;
  const next = { ...settings };
  delete next.creditedOnly;
  return next;
}
