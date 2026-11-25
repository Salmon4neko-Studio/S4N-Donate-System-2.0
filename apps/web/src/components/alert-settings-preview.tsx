import { useState, type CSSProperties } from "react";
import { parseAlertAppearance, renderAlertCopy, type DonationAlert } from "s4n-donate-system-2.0-plugin-alerts";
import { buttonClass } from "@/components/fields";
import "s4n-donate-system-2.0-plugin-alerts/motion.css";

const SAMPLE: DonationAlert = {
  id: "preview",
  donorName: "小滿",
  amountMinor: 520,
  currency: "TWD",
  message: "謝謝你的實況",
  test: false,
};

export function AlertSettingsPreview({ drafts }: { drafts: Record<string, string> }) {
  const [play, setPlay] = useState(0);
  const appearance = parseAlertAppearance(draftsToSettings(drafts));
  const copy = renderAlertCopy(SAMPLE, appearance);
  const style = {
    "--s4n-alert-primary": appearance.primaryColor,
    "--s4n-alert-secondary": appearance.secondaryColor,
    "--s4n-alert-title": appearance.titleColor,
    "--s4n-alert-body": appearance.bodyColor,
  } as CSSProperties;

  return (
    <aside className="s4n-alert-preview" aria-label="提醒預覽">
      <p className="ts-text is-label">即時預覽</p>
      <p className="ts-text is-description">範例是小滿、NT$520、「謝謝你的實況」。改欄位會立刻反映。儲存後，疊層上的測試贊助用同一套。</p>
      <article key={`${play}-${appearance.enterAnimation}`} className={`s4n-alert-card s4n-enter-${appearance.enterAnimation}`} style={style}>
        <p className="s4n-alert-kicker">預覽</p>
        {copy.title ? <h2 className="s4n-alert-title">{copy.title}</h2> : null}
        {copy.body ? <p className="s4n-alert-body">{copy.body}</p> : null}
      </article>
      <button type="button" className={buttonClass({ variant: "outlined", size: "small" })} onClick={() => setPlay((current) => current + 1)}>
        再播一次進場
      </button>
    </aside>
  );
}

function draftsToSettings(drafts: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(drafts)) {
    if (key === "durationMs") {
      if (/^\d+$/.test(value)) settings[key] = Number(value);
      continue;
    }
    settings[key] = value;
  }
  return settings;
}
