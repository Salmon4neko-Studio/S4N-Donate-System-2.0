import type { CSSProperties } from "react";
import { buildTickerLine, parseTickerSettings } from "s4n-donate-system-2.0-plugin-ticker";

export function TickerSettingsPreview({ drafts }: { drafts: Record<string, string> }) {
  const settings = draftsToSettings(drafts);
  const appearance = parseTickerSettings(settings);
  const line = buildTickerLine(settings, []);
  const style = {
    "--ticker-text": appearance.textColor,
    "--ticker-primary": appearance.primaryColor,
    "--ticker-secondary": appearance.secondaryColor,
  } as CSSProperties;

  return (
    <aside className="s4n-ticker-preview" aria-label="跑馬燈預覽" style={style}>
      <p className="ts-text is-label">文字預覽</p>
      <p className="ts-text is-description">隱藏字元已拿掉。最近的贊助會在疊層接在後面，這裡只顯示自訂文字。</p>
      <div className="ticker-viewport is-still">
        <p className="ticker-track">{line === "" ? "還沒有文字" : line}</p>
      </div>
    </aside>
  );
}

function draftsToSettings(drafts: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = { ...drafts };
  settings.includeDonations = drafts.includeDonations === "true";
  settings.includeMessage = drafts.includeMessage === "true";
  if (/^\d+$/.test(drafts.donationCount ?? "")) settings.donationCount = Number(drafts.donationCount);
  if (/^\d+$/.test(drafts.speed ?? "")) settings.speed = Number(drafts.speed);
  return settings;
}
