import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PluginCard } from "@/components/plugin-card";
import { PermissionDialog, UninstallDialog } from "@/components/marketplace-dialogs";
import { Note } from "@/components/fields";
import { ApiError, api, type PluginSummary } from "@/lib/api";
import { marketplaceError } from "@/lib/marketplace";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; plugins: PluginSummary[] }
  | { status: "error" };

export function PluginsPage() {
  const [params] = useSearchParams();
  const openId = params.get("settings");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [review, setReview] = useState<PluginSummary | null>(null);
  const [removing, setRemoving] = useState<PluginSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load(signal?: AbortSignal) {
    return api<{ plugins: PluginSummary[] }>("/api/plugins", signal ? { signal } : undefined)
      .then((body) => setState({ status: "ready", plugins: body.plugins }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function update(plugin: PluginSummary) {
    setBusyId(plugin.id);
    setNotice(null);
    try {
      await api(`/api/marketplace/${plugin.id}/update`, {
        method: "POST",
        body: JSON.stringify({ acceptedPermissions: plugin.permissions }),
      });
      setReview(null);
      await load();
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? marketplaceError(error.body, "沒有更新。") : "沒有更新。");
    } finally {
      setBusyId(null);
    }
  }

  async function pin(plugin: PluginSummary) {
    setBusyId(plugin.id);
    setNotice(null);
    try {
      await api(`/api/marketplace/${plugin.id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned: !plugin.pinned }),
      });
      await load();
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? marketplaceError(error.body, "沒有改釘選。") : "沒有改釘選。");
    } finally {
      setBusyId(null);
    }
  }

  async function uninstall(plugin: PluginSummary, keepData: boolean) {
    setBusyId(plugin.id);
    setNotice(null);
    try {
      await api(`/api/marketplace/${plugin.id}/uninstall`, {
        method: "POST",
        body: JSON.stringify({ keepData }),
      });
      setRemoving(null);
      await load();
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? marketplaceError(error.body, "沒有移除。") : "沒有移除。");
    } finally {
      setBusyId(null);
    }
  }

  const updates = state.status === "ready" ? state.plugins.filter((plugin) => plugin.updateAvailable).length : 0;

  return (
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">外掛庫</p>
        <h1 className="ts-header is-huge">已安裝的外掛</h1>
        <p className="ts-text is-description s4n-lede">
          這些是已經安裝的官方外掛。可以啟用、停用、釘選版本或移除。新的外掛在市集裡。密文欄位只會告訴你已設定或未設定。
        </p>
      </header>
      {updates > 0 ? <Note>{updates} 個外掛有更新。釘選中的版本不會被換掉。</Note> : null}
      {notice ? <Note tone="danger">{notice}</Note> : null}

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取外掛庫…</p> : null}
      {state.status === "error" ? <Note tone="danger">讀不到外掛庫。</Note> : null}
      {state.status === "ready" && state.plugins.length === 0 ? (
        <section className="ts-box is-hollowed">
          <div className="ts-blankslate">
            <span className="ts-icon is-puzzle-piece-icon" aria-hidden="true" />
            <p className="header">還沒有安裝外掛。</p>
          </div>
        </section>
      ) : null}
      {state.status === "ready" ? (
        <ul className="s4n-stack">
          {state.plugins.map((plugin) => (
            <li key={plugin.id} id={`plugin-${plugin.id}`}>
              <PluginCard
                plugin={plugin}
                settingsOpen={openId === plugin.id}
                busy={busyId === plugin.id}
                onUpdate={() => {
                  if (plugin.addedPermissions.length > 0) setReview(plugin);
                  else void update(plugin);
                }}
                onPin={() => void pin(plugin)}
                onUninstall={() => setRemoving(plugin)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {review ? (
        <PermissionDialog
          open
          mode="update"
          name={review.name}
          permissions={review.permissions}
          added={review.addedPermissions}
          pending={busyId === review.id}
          onClose={() => setReview(null)}
          onConfirm={() => void update(review)}
        />
      ) : null}
      {removing ? (
        <UninstallDialog
          open
          name={removing.name}
          pending={busyId === removing.id}
          onClose={() => setRemoving(null)}
          onConfirm={(keepData) => void uninstall(removing, keepData)}
        />
      ) : null}
    </div>
  );
}
