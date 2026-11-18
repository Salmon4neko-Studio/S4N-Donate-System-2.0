import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { PluginFrame, PluginMark } from "@/components/plugin-art";
import { buttonClass, Note, TextInput } from "@/components/fields";
import { ApiError, api, type MarketplaceListing, type MarketplaceResponse } from "@/lib/api";
import { blockCopy, categoryLabel, marketplaceError } from "@/lib/marketplace";
import { formatTaipei } from "@/lib/time";

const categories = [
  { id: "all", label: "全部" },
  { id: "payment", label: "金流" },
  { id: "overlay", label: "疊層" },
  { id: "chat-source", label: "聊天室來源" },
  { id: "tool", label: "工具" },
] as const;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; body: MarketplaceResponse }
  | { status: "error"; message: string };

export function MarketplacePage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "all";
  const query = params.get("q") ?? "";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [checking, setChecking] = useState(false);

  function load(signal?: AbortSignal) {
    return api<MarketplaceResponse>("/api/marketplace", signal ? { signal } : undefined)
      .then((body) => setState({ status: "ready", body }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof ApiError ? marketplaceError(error.body, "讀不到市集。") : "讀不到市集。";
        setState({ status: "error", message });
      });
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const plugins = state.status === "ready" ? state.body.plugins : [];
  const filtered = useMemo(() => filterPlugins(plugins, category, query), [plugins, category, query]);
  const featured = filtered.filter((plugin) => plugin.featured);

  function setCategory(next: string) {
    const following = new URLSearchParams(params);
    if (next === "all") following.delete("category");
    else following.set("category", next);
    setParams(following);
  }

  function setQuery(next: string) {
    const following = new URLSearchParams(params);
    if (next === "") following.delete("q");
    else following.set("q", next);
    setParams(following, { replace: true });
  }

  async function check() {
    setChecking(true);
    try {
      await api("/api/marketplace/check", { method: "POST" });
      await load();
    } catch (error: unknown) {
      const message = error instanceof ApiError ? marketplaceError(error.body, "這次沒有檢查成功。") : "這次沒有檢查成功。";
      setState({ status: "error", message });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="s4n-stack is-loose s4n-store">
      <header className="s4n-store-hero">
        <div className="s4n-split">
          <div>
            <p className="s4n-kicker">市集</p>
            <h1 className="ts-header is-huge">外掛市集</h1>
          </div>
          <button
            type="button"
            className={buttonClass({ tone: "accent", icon: "start", loading: checking })}
            disabled={checking || state.status === "loading"}
            onClick={() => void check()}
          >
            <span className="ts-icon is-rotate-icon" aria-hidden="true" />
            {checking ? "檢查中…" : "檢查更新"}
          </button>
        </div>
        <p className="ts-text is-description s4n-lede">
          官方外掛從簽過名的索引安裝。金流只有綠界與歐付寶。安裝前會先看權限，更新若多了權限會再看一次。
        </p>
        {state.status === "ready" && state.body.checkedAt ? (
          <p className="ts-text is-small is-description">上次檢查 {formatTaipei(state.body.checkedAt)}。伺服器也會定期再驗一次簽章，不會自動安裝。</p>
        ) : null}
      </header>

      <div className="s4n-store-tools">
        <label className="s4n-store-search" htmlFor="marketplace-search">
          <span className="ts-text is-label">搜尋</span>
          <TextInput
            id="marketplace-search"
            type="search"
            placeholder="名稱、作者或說明"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="s4n-chip-row" role="group" aria-label="分類">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={buttonClass({
                tone: category === item.id ? "accent" : "neutral",
                variant: category === item.id ? "solid" : "outlined",
                size: "small",
              })}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取市集…</p> : null}
      {state.status === "error" ? <Note tone="danger">{state.message}</Note> : null}

      {state.status === "ready" && featured.length > 0 ? (
        <section className="s4n-stack" aria-label="精選">
          <h2 className="ts-header">精選</h2>
          <div className="s4n-feature-row">
            {featured.map((plugin) => (
              <FeaturedCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <section className="s4n-stack" aria-label="目錄">
          <h2 className="ts-header">{category === "all" ? "全部外掛" : categoryLabel[category] ?? "外掛"}</h2>
          {filtered.length === 0 ? (
            <div className="ts-box is-hollowed">
              <div className="ts-blankslate">
                <span className="ts-icon is-store-slash-icon" aria-hidden="true" />
                <p className="header">沒有符合的外掛。</p>
              </div>
            </div>
          ) : (
            <ul className="s4n-store-grid">
              {filtered.map((plugin) => (
                <li key={plugin.id}>
                  <StoreCard plugin={plugin} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function FeaturedCard({ plugin }: { plugin: MarketplaceListing }) {
  const shot = plugin.screenshots[0];
  return (
    <article className="ts-box is-raised s4n-feature-card">
      <div className="ts-content is-padded s4n-stack">
        {shot ? <PluginFrame frame={shot.frame} alt={shot.alt} caption={shot.caption} /> : null}
        <div className="s4n-card-title">
          <PluginMark icon={plugin.icon} name={plugin.name} />
          <h3 className="ts-header is-large">{plugin.name}</h3>
        </div>
        <p className="ts-text is-description">{plugin.description}</p>
        <Badges plugin={plugin} />
        <Link to={`/marketplace/${plugin.id}`} className={buttonClass({ tone: "accent" })}>
          查看
        </Link>
      </div>
    </article>
  );
}

function StoreCard({ plugin }: { plugin: MarketplaceListing }) {
  return (
    <article className="ts-box is-raised s4n-store-card">
      <div className="ts-content is-padded s4n-stack">
        <div className="s4n-card-title">
          <PluginMark icon={plugin.icon} name={plugin.name} />
          <div>
            <h3 className="ts-header">{plugin.name}</h3>
            <p className="ts-text is-small is-description">{plugin.author} · {plugin.version}</p>
          </div>
        </div>
        <p className="ts-text is-description s4n-clamp">{plugin.description}</p>
        <Badges plugin={plugin} />
        <Link to={`/marketplace/${plugin.id}`} className={buttonClass({ variant: "outlined", size: "small" })}>
          詳細資料
        </Link>
      </div>
    </article>
  );
}

function Badges({ plugin }: { plugin: MarketplaceListing }) {
  return (
    <div className="ts-wrap is-middle-aligned">
      <span className="ts-badge is-secondary">{categoryLabel[plugin.category] ?? plugin.category}</span>
      {plugin.official ? <span className="ts-badge is-outlined">官方</span> : <span className="ts-badge is-outlined">社群</span>}
      {plugin.installed ? <span className="ts-badge">已安裝</span> : null}
      {plugin.updateAvailable ? <span className="ts-badge is-warning">有更新</span> : null}
      {!plugin.installable && !plugin.installed && plugin.blockReason ? (
        <span className="ts-badge is-outlined">{blockCopy[plugin.blockReason] ? "無法安裝" : plugin.blockReason}</span>
      ) : null}
    </div>
  );
}

function filterPlugins(plugins: readonly MarketplaceListing[], category: string, query: string): MarketplaceListing[] {
  const needle = query.trim().toLowerCase();
  return plugins.filter((plugin) => {
    if (category !== "all" && plugin.category !== category) return false;
    if (needle === "") return true;
    const haystack = `${plugin.name} ${plugin.author} ${plugin.description} ${plugin.id}`.toLowerCase();
    return haystack.includes(needle);
  });
}
