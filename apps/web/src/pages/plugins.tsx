import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PluginCard } from "@/components/plugin-card";
import { Note } from "@/components/fields";
import { api, type PluginSummary } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; plugins: PluginSummary[] }
  | { status: "error" };

export function PluginsPage() {
  const [params] = useSearchParams();
  const openId = params.get("settings");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api<{ plugins: PluginSummary[] }>("/api/plugins", { signal: controller.signal })
      .then((body) => setState({ status: "ready", plugins: body.plugins }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">外掛庫</p>
        <h1 className="ts-header is-huge">已安裝的外掛</h1>
        <p className="ts-text is-description s4n-lede">
          清單來自每份 s4n-plugin.json。可以啟用或停用。標成密文的欄位只會告訴你已設定或未設定，不會把明文或密文送回瀏覽器。
        </p>
      </header>

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取外掛庫…</p> : null}
      {state.status === "error" ? <Note tone="danger">讀不到外掛庫。</Note> : null}
      {state.status === "ready" && state.plugins.length === 0 ? (
        <section className="ts-box is-hollowed">
          <div className="ts-blankslate">
            <span className="ts-icon is-puzzle-piece-icon" aria-hidden="true" />
            <p className="header">官方目錄是空的。</p>
          </div>
        </section>
      ) : null}
      {state.status === "ready" ? (
        <ul className="s4n-stack">
          {state.plugins.map((plugin) => (
            <li key={plugin.id} id={`plugin-${plugin.id}`}>
              <PluginCard plugin={plugin} settingsOpen={openId === plugin.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
