import type { CSSProperties } from "react";
import { goalPercent, parseGoalSettings } from "@s4n/plugin-goals";
import { formatTwd } from "@/lib/money";

export function GoalSettingsPreview({ drafts }: { drafts: Record<string, string> }) {
  const appearance = parseGoalSettings(draftsToSettings(drafts));
  const sample = Math.round(appearance.targetMinor * 0.62);
  const percent = goalPercent(sample, appearance.targetMinor);
  const style = {
    "--goal-text": appearance.textColor,
    "--goal-primary": appearance.primaryColor,
    "--goal-secondary": appearance.secondaryColor,
  } as CSSProperties;

  return (
    <aside className="s4n-goal-preview" aria-label="目標預覽" style={style}>
      <p className="ts-text is-label">外觀預覽</p>
      <p className="ts-text is-description">這條是示意，不是帳本數字。儲存後，疊層依已付款重算，並即時更新。</p>
      <article className="goal-card">
        <h2 className="goal-title">{appearance.title}</h2>
        <p className="goal-amounts">
          {formatTwd(sample)} / {formatTwd(appearance.targetMinor)}
          <span className="goal-percent">{percent}%</span>
        </p>
        <div className="goal-track">
          <div className="goal-fill" style={{ width: `${percent}%` }} />
        </div>
      </article>
    </aside>
  );
}

function draftsToSettings(drafts: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = { ...drafts };
  if (/^\d+$/.test(drafts.targetMinor ?? "")) settings.targetMinor = Number(drafts.targetMinor);
  settings.creditedOnly = drafts.creditedOnly === "true";
  return settings;
}
