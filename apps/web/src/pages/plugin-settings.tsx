import { useState } from "react";
import { Link, useParams } from "react-router";
import { AlertSettingsPreview } from "@/components/alert-settings-preview";
import { AlertSoundSettings } from "@/components/alert-sound-settings";
import { GoalSettingsPreview } from "@/components/goal-settings-preview";
import { Note } from "@/components/fields";
import { PluginSettingsForm } from "@/components/plugin-settings-form";
import { TickerSettingsPreview } from "@/components/ticker-settings-preview";
import { usePluginNav } from "@/lib/plugin-nav";

export function PluginSettingsPage() {
  const params = useParams();
  const pluginId = params.pluginId ?? "";
  const nav = usePluginNav();
  const plugin = nav.plugins.find((item) => item.id === pluginId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const alerts = plugin?.id === "official.alerts";
  const goals = plugin?.id === "official.goals";
  const ticker = plugin?.id === "official.ticker";
  const wide = alerts || goals || ticker;

  return (
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">外掛設定</p>
        <h1 className="ts-header is-huge">{plugin?.name ?? "外掛設定"}</h1>
        {plugin?.description ? <p className="ts-text is-description s4n-lede">{plugin.description}</p> : null}
      </header>

      {nav.status === "loading" ? <p className="ts-text is-description">正在讀取外掛…</p> : null}
      {nav.status === "error" ? <Note tone="danger">讀不到外掛。</Note> : null}
      {nav.status === "ready" && plugin === undefined ? (
        <Note>
          沒有這個外掛。{" "}
          <Link to="/plugins" className="ts-text is-link">
            回到外掛
          </Link>
        </Note>
      ) : null}
      {plugin && !plugin.enabled ? (
        <Note>
          這個外掛已停用。到外掛頁啟用後才能改設定。{" "}
          <Link to="/plugins" className="ts-text is-link">
            回到外掛
          </Link>
        </Note>
      ) : null}
      {plugin?.enabled ? (
        <section className="ts-box is-raised">
          <div className={`ts-content is-padded ${wide ? "s4n-alert-settings" : ""}`}>
            <div className="s4n-stack">
              <PluginSettingsForm pluginId={plugin.id} scope="public" onDraft={wide ? setDrafts : undefined} />
              {alerts ? <AlertSoundSettings /> : null}
            </div>
            {alerts ? <AlertSettingsPreview drafts={drafts} /> : null}
            {goals ? <GoalSettingsPreview drafts={drafts} /> : null}
            {ticker ? <TickerSettingsPreview drafts={drafts} /> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
