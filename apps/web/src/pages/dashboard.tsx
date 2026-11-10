import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type HealthResponse } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; health: HealthResponse }
  | { status: "error" };

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api<HealthResponse>("/api/health", { signal: controller.signal })
      .then((health) => setState({ status: "ready", health }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <p className="text-xs tracking-[0.18em] text-cinnabar">營運</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">帳本還是空的介面</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          贊助會記在核心帳本。付款外掛只能驗證回呼，不能自己寫入。這頁不顯示假的金額。
        </p>
      </div>

      <HealthLine state={state} />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-card border-line bg-paper-raised shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-medium">帳本</CardTitle>
            <CardDescription>尚無可讀的贊助列表。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-ink-soft">
            這不是「今天沒有人贊助」。列表還沒做。驗證通過之後，才會由核心入帳。
          </CardContent>
        </Card>
        <Card className="rounded-card border-line bg-paper-raised shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-medium">即時</CardTitle>
            <CardDescription>WebSocket 只回答連線就緒。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-ink-soft">
            OBS 疊層收得到連線狀態，不會播放提醒動畫。
          </CardContent>
        </Card>
        <Card className="rounded-card border-line bg-paper-raised shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-medium">密鑰</CardTitle>
            <CardDescription>AES-256-GCM，主金鑰只在伺服器。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-ink-soft">
            儀表板讀得到「已設定」，讀不到明文。到
            <Link to="/plugins" className="mx-1 text-indigo underline-offset-4 hover:underline">
              外掛庫
            </Link>
            看哪些欄位會被加密。
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function HealthLine({ state }: { state: LoadState }) {
  if (state.status === "loading") {
    return <p className="text-sm text-ink-soft">正在詢問核心 API…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-cinnabar" role="status">
        核心 API 沒有回應。請確認 `pnpm dev` 已啟動，且 VITE_API_URL 指到它。
      </p>
    );
  }

  const database =
    state.health.database === "up"
      ? "資料庫已連線"
      : state.health.database === "down"
        ? "資料庫未連線"
        : "資料庫未設定";

  return (
    <div className="flex flex-wrap items-center gap-2" role="status">
      <Badge variant="secondary">核心已回應</Badge>
      <Badge variant="outline">{database}</Badge>
      <Badge variant="outline">付款外掛 {state.health.payments.length}</Badge>
      <Badge variant="outline">
        {state.health.realtime === "stub" ? "即時通道佔位" : `即時 ${state.health.realtime}`}
      </Badge>
    </div>
  );
}
