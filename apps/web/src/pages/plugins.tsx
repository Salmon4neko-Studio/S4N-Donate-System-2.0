import { useEffect, useState } from "react";
import { PluginCard } from "@/components/plugin-card";
import { api, type PluginSummary } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; plugins: PluginSummary[] }
  | { status: "error" };

export function PluginsPage() {
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
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <p className="text-xs tracking-[0.18em] text-cinnabar">外掛庫</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">已安裝的外掛</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          清單來自每份 s4n-plugin.json。可以啟用或停用。標成密文的欄位只會告訴你已設定或尚未設定，不會把明文或密文送回瀏覽器。
        </p>
      </div>

      {state.status === "loading" ? <p className="text-sm text-ink-soft">正在讀取外掛庫…</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-cinnabar" role="status">
          讀不到外掛庫。
        </p>
      ) : null}
      {state.status === "ready" && state.plugins.length === 0 ? <p className="text-sm text-ink-soft">官方目錄是空的。</p> : null}
      {state.status === "ready" ? (
        <ul className="grid gap-4">
          {state.plugins.map((plugin) => (
            <li key={plugin.id}>
              <PluginCard plugin={plugin} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
