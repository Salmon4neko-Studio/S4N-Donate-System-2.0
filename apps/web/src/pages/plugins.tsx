import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type PluginSummary } from "@/lib/api";

const kindLabel: Record<string, string> = {
  overlay: "疊層",
  dashboard: "儀表板",
  connector: "連接器",
  payment: "付款",
  processor: "處理器",
};

const permissionLabel: Record<string, string> = {
  "events.subscribe": "訂閱事件",
  "events.emit": "發送事件",
  "overlay.slot": "疊層版位",
  "dashboard.settings": "儀表板設定",
  "tts.speak": "語音",
  "payments.read": "讀取帳本",
  "payments.provider": "付款提供者",
  secrets: "密鑰",
  network: "對外網路",
};

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
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">官方外掛，還沒有開關</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          啟用與金鑰寫入的表單還不在這個畫面。這裡只列出清單、權限，以及哪些欄位會加密。密文不會回到瀏覽器。
        </p>
      </div>

      {state.status === "loading" ? <p className="text-sm text-ink-soft">正在讀取外掛庫…</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-cinnabar" role="status">
          讀不到外掛庫。核心 API 沒有回應。
        </p>
      ) : null}
      {state.status === "ready" && state.plugins.length === 0 ? (
        <p className="text-sm text-ink-soft">官方目錄是空的。</p>
      ) : null}
      {state.status === "ready" ? (
        <ul className="grid gap-4">
          {state.plugins.map((plugin) => (
            <li key={plugin.id}>
              <Card className="rounded-card border-line bg-paper-raised shadow-soft">
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <CardTitle className="font-serif text-2xl font-medium">{plugin.name}</CardTitle>
                    <code className="text-xs text-ink-soft">{plugin.id}</code>
                  </div>
                  <CardDescription className="text-sm leading-6">
                    {plugin.description ?? "沒有說明。"}
                  </CardDescription>
                  <div className="flex flex-wrap gap-2">
                    {plugin.kind.map((kind) => (
                      <Badge key={kind} variant={kind === "payment" ? "default" : "secondary"}>
                        {kindLabel[kind] ?? kind}
                      </Badge>
                    ))}
                    <Badge variant="outline">啟用尚未接上</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-2">
                  <div>
                    <h2 className="text-sm text-ink">權限</h2>
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
                      {plugin.permissions.map((permission) => (
                        <li key={permission}>
                          <code className="text-ink">{permission}</code>
                          <span className="ml-2">{permissionLabel[permission] ?? ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h2 className="text-sm text-ink">設定欄位</h2>
                    {plugin.settingsFields.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-soft">沒有設定欄位。</p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2 text-sm">
                        {plugin.settingsFields.map((field) => (
                          <li key={field.key} className="flex flex-wrap items-center gap-2">
                            <span>{field.title ?? field.key}</span>
                            {field.secret ? <Badge variant="outline">密文</Badge> : null}
                            {field.required ? <span className="text-xs text-ink-soft">必填</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
