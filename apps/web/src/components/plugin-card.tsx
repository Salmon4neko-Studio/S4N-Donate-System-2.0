import { useState } from "react";
import { Link } from "react-router";
import { buttonClass, Note } from "@/components/fields";
import { PluginSettingsForm } from "@/components/plugin-settings-form";
import { api, type PluginSummary } from "@/lib/api";
import { usePluginNav } from "@/lib/plugin-nav";

const kindLabel: Record<string, string> = {
  overlay: "疊層",
  dashboard: "儀表板",
  connector: "連接器",
  payment: "付款",
  processor: "處理器",
};

export function PluginCard({
  plugin,
  onUpdate,
  onPin,
  onUninstall,
  busy,
}: {
  plugin: PluginSummary;
  onUpdate?: () => void;
  onPin?: () => void;
  onUninstall?: () => void;
  busy?: boolean;
}) {
  const nav = usePluginNav();
  const [enabled, setEnabled] = useState(plugin.enabled);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const hasSecrets = plugin.settingsFields.some((field) => field.secret);
  const hasPublic = plugin.settingsNav;

  async function toggle() {
    setPending(true);
    setNotice(null);
    try {
      const body = await api<{ enabled: boolean }>(`/api/plugins/${plugin.id}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled(body.enabled);
      await nav.reload();
    } catch {
      setNotice("啟用狀態沒有更新。");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="ts-box is-raised" id={`plugin-${plugin.id}`}>
      <div className="ts-content is-padded s4n-stack">
        <div className="s4n-split">
          <h2 className="ts-header is-large">{plugin.name}</h2>
          <code className="ts-text is-code">{plugin.id}</code>
        </div>
        <p className="ts-text is-description">{plugin.description ?? "沒有說明。"}</p>
        <div className="ts-wrap is-middle-aligned">
          {plugin.kind.map((kind) => (
            <span key={kind} className={kind === "payment" ? "ts-badge is-accent" : "ts-badge is-secondary"}>
              {kindLabel[kind] ?? kind}
            </span>
          ))}
          <span className="ts-badge is-outlined">{enabled ? "啟用中" : "已停用"}</span>
          {plugin.official ? <span className="ts-badge is-outlined">官方</span> : null}
        </div>
        <div className="s4n-choices">
          <button
            type="button"
            className={buttonClass({
              tone: enabled ? "neutral" : "accent",
              variant: enabled ? "outlined" : "solid",
              icon: "start",
              loading: pending,
            })}
            disabled={pending}
            onClick={() => void toggle()}
            aria-pressed={enabled}
          >
            <span className={enabled ? "ts-icon is-pause-icon" : "ts-icon is-play-icon"} aria-hidden="true" />
            {pending ? "處理中…" : enabled ? "停用" : "啟用"}
          </button>
          {plugin.updateAvailable && onUpdate ? (
            <button type="button" className={buttonClass({ tone: "accent", icon: "start" })} disabled={busy} onClick={onUpdate}>
              <span className="ts-icon is-rotate-icon" aria-hidden="true" />
              更新到 {plugin.latestVersion}
            </button>
          ) : null}
          {onPin ? (
            <button type="button" className={buttonClass({ variant: "outlined", size: "small" })} disabled={busy} onClick={onPin}>
              {plugin.pinned ? "取消釘選" : "釘選此版本"}
            </button>
          ) : null}
          {onUninstall ? (
            <button type="button" className={buttonClass({ variant: "outlined", size: "small" })} disabled={busy} onClick={onUninstall}>
              移除
            </button>
          ) : null}
        </div>
        <p className="ts-text is-description is-small">
          安裝版本 {plugin.version}
          {plugin.latestVersion !== plugin.version ? ` · 市集 ${plugin.latestVersion}` : ""}
          {plugin.pinned ? " · 已釘選" : ""}
          {plugin.author ? ` · ${plugin.author}` : ""}
        </p>
        {plugin.updateAvailable ? <span className="ts-badge is-warning">有更新</span> : null}
        {plugin.kind.includes("payment") ? (
          <p className="ts-text is-description">
            啟用且必填欄位都設定之後，才會出現在贊助頁。密文只顯示已設定或尚未設定。測試站或正式站在側欄的這項設定。
          </p>
        ) : null}
        {hasPublic ? (
          <p className="ts-text is-description is-small">
            {enabled ? (
              <>
                其餘設定在側欄「外掛」的
                <Link to={`/plugins/${encodeURIComponent(plugin.id)}/settings`} className="ts-text is-link">
                  {plugin.name}
                </Link>
                。
              </>
            ) : (
              "啟用之後，其餘設定會出現在側欄的外掛選單。"
            )}
          </p>
        ) : null}
        {notice ? <Note tone="danger">{notice}</Note> : null}
      </div>
      {hasSecrets ? (
        <div className="ts-content is-tertiary is-padded s4n-stack" id={`plugin-${plugin.id}-secrets`}>
          <h3 className="ts-header">密文</h3>
          <PluginSettingsForm pluginId={plugin.id} scope="secret" />
        </div>
      ) : null}
    </article>
  );
}
