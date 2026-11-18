import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { PermissionDialog } from "@/components/marketplace-dialogs";
import { PluginFrame, PluginMark } from "@/components/plugin-art";
import { buttonClass, Note } from "@/components/fields";
import { ApiError, api, type MarketplaceListing } from "@/lib/api";
import { blockCopy, categoryLabel, marketplaceError, permissionCopy } from "@/lib/marketplace";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; plugin: MarketplaceListing }
  | { status: "missing" }
  | { status: "error"; message: string };

export function MarketplaceDetailPage() {
  const { pluginId } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [review, setReview] = useState<"install" | "update" | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function load(id: string, signal?: AbortSignal) {
    return api<{ plugin: MarketplaceListing }>(`/api/marketplace/${id}`, signal ? { signal } : undefined)
      .then((body) => setState({ status: "ready", plugin: body.plugin }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "missing" });
          return;
        }
        const message = error instanceof ApiError ? marketplaceError(error.body, "讀不到這個外掛。") : "讀不到這個外掛。";
        setState({ status: "error", message });
      });
  }

  useEffect(() => {
    if (pluginId === undefined) return;
    const controller = new AbortController();
    void load(pluginId, controller.signal);
    return () => controller.abort();
  }, [pluginId]);

  async function confirm(plugin: MarketplaceListing) {
    if (review === null) return;
    setPending(true);
    setNotice(null);
    try {
      await api(`/api/marketplace/${plugin.id}/${review === "install" ? "install" : "update"}`, {
        method: "POST",
        body: JSON.stringify({ acceptedPermissions: plugin.permissions }),
      });
      setReview(null);
      await load(plugin.id);
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? marketplaceError(error.body, "沒有完成。") : "沒有完成。");
      setReview(null);
    } finally {
      setPending(false);
    }
  }

  if (pluginId === undefined || state.status === "missing") {
    return (
      <div className="s4n-stack">
        <Link to="/marketplace" className="ts-text is-link">
          回到市集
        </Link>
        <Note tone="danger">找不到這個外掛。</Note>
      </div>
    );
  }

  return (
    <div className="s4n-stack is-loose">
      <Link to="/marketplace" className="ts-text is-link">
        回到市集
      </Link>
      {state.status === "loading" ? <p className="ts-text is-description">正在讀取外掛…</p> : null}
      {state.status === "error" ? <Note tone="danger">{state.message}</Note> : null}
      {state.status === "ready" ? (
        <Detail
          plugin={state.plugin}
          notice={notice}
          pending={pending}
          onInstall={() => setReview("install")}
          onUpdate={() => {
            if (state.plugin.addedPermissions.length > 0) {
              setReview("update");
              return;
            }
            void runUpdate(state.plugin, setPending, setNotice, () => load(state.plugin.id));
          }}
        />
      ) : null}
      {state.status === "ready" && review !== null && (review === "install" || state.plugin.addedPermissions.length > 0) ? (
        <PermissionDialog
          open
          mode={review}
          name={state.plugin.name}
          permissions={state.plugin.permissions}
          added={review === "update" ? state.plugin.addedPermissions : []}
          pending={pending}
          onClose={() => setReview(null)}
          onConfirm={() => void confirm(state.plugin)}
        />
      ) : null}
    </div>
  );
}

function Detail({
  plugin,
  notice,
  pending,
  onInstall,
  onUpdate,
}: {
  plugin: MarketplaceListing;
  notice: string | null;
  pending: boolean;
  onInstall: () => void;
  onUpdate: () => void;
}) {
  return (
    <article className="s4n-detail">
      <header className="s4n-detail-head">
        <PluginMark icon={plugin.icon} name={plugin.name} />
        <div className="s4n-stack">
          <p className="s4n-kicker">{categoryLabel[plugin.category] ?? plugin.category}</p>
          <h1 className="ts-header is-huge">{plugin.name}</h1>
          <p className="ts-text is-description">
            {plugin.author} · 版本 {plugin.installed ? plugin.installedVersion : plugin.version}
            {plugin.updateAvailable ? ` · 可更新到 ${plugin.version}` : ""}
          </p>
          <div className="ts-wrap">
            {plugin.official ? <span className="ts-badge is-outlined">官方</span> : <span className="ts-badge is-outlined">社群</span>}
            {plugin.installed ? <span className="ts-badge">已安裝</span> : null}
            {plugin.enabled ? <span className="ts-badge is-positive">啟用中</span> : null}
            {plugin.pinned ? <span className="ts-badge is-outlined">已釘選</span> : null}
            {plugin.updateAvailable ? <span className="ts-badge is-warning">有更新</span> : null}
          </div>
        </div>
      </header>

      <div className="s4n-detail-grid">
        <div className="s4n-stack">
          <p className="ts-text">{plugin.description}</p>
          {plugin.screenshots.length > 0 ? (
            <div className="s4n-frame-row">
              {plugin.screenshots.map((shot) => (
                <PluginFrame key={shot.caption} frame={shot.frame} alt={shot.alt} caption={shot.caption} />
              ))}
            </div>
          ) : null}
          <p className="ts-text is-small is-description">示意畫面跟著分類畫在這個頁面上，不載入外掛提供的網址。</p>
          <section className="ts-box is-raised">
            <div className="ts-content is-padded s4n-stack">
              <h2 className="ts-header">更新紀錄</h2>
              <p className="ts-text">{plugin.changelog}</p>
            </div>
          </section>
        </div>
        <aside className="ts-box is-raised is-top-indicated">
          <div className="ts-content is-padded s4n-stack">
            <h2 className="ts-header">安裝</h2>
            <p className="ts-text is-description">
              相容於核心 {plugin.compatibility.core}、外掛規格 {plugin.compatibility.pluginSpec}。
            </p>
            {plugin.runtime === "metadata" ? (
              <p className="ts-text is-description">這個版本只記下安裝，不會執行社群外掛的程式。</p>
            ) : null}
            {plugin.blockReason ? <Note>{blockCopy[plugin.blockReason] ?? "目前不能安裝。"}</Note> : null}
            {notice ? <Note tone="danger">{notice}</Note> : null}
            <Actions plugin={plugin} pending={pending} onInstall={onInstall} onUpdate={onUpdate} />
            <h3 className="ts-header">權限</h3>
            <ul className="s4n-permission-list">
              {plugin.permissions.map((permission) => (
                <li key={permission} className="s4n-permission">
                  <strong>{permissionCopy[permission]?.label ?? permission}</strong>
                  <p className="ts-text is-description is-small">{permissionCopy[permission]?.detail}</p>
                </li>
              ))}
            </ul>
            {plugin.installed ? (
              <Link to={`/plugins#plugin-${plugin.id}`} className={buttonClass({ variant: "outlined" })}>
                到已安裝的外掛
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </article>
  );
}

function Actions({
  plugin,
  pending,
  onInstall,
  onUpdate,
}: {
  plugin: MarketplaceListing;
  pending: boolean;
  onInstall: () => void;
  onUpdate: () => void;
}) {
  if (plugin.updateAvailable) {
    return (
      <button type="button" className={buttonClass({ tone: "accent", loading: pending })} disabled={pending || plugin.pinned} onClick={onUpdate}>
        {plugin.pinned ? "已釘選，不能更新" : `更新到 ${plugin.version}`}
      </button>
    );
  }
  if (plugin.installed) {
    return <p className="ts-text">已經安裝。可以在外掛頁啟用、停用或移除。</p>;
  }
  return (
    <button type="button" className={buttonClass({ tone: "accent", loading: pending })} disabled={!plugin.installable || pending} onClick={onInstall}>
      {plugin.installable ? "安裝" : "無法安裝"}
    </button>
  );
}

async function runUpdate(
  plugin: MarketplaceListing,
  setPending: (value: boolean) => void,
  setNotice: (value: string | null) => void,
  reload: () => Promise<void>,
) {
  setPending(true);
  setNotice(null);
  try {
    await api(`/api/marketplace/${plugin.id}/update`, {
      method: "POST",
      body: JSON.stringify({ acceptedPermissions: plugin.permissions }),
    });
    await reload();
  } catch (error: unknown) {
    setNotice(error instanceof ApiError ? marketplaceError(error.body, "沒有完成。") : "沒有完成。");
  } finally {
    setPending(false);
  }
}
