import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type HealthResponse } from "@/lib/api";
import { sendTestDonation, testDonationErrorMessage } from "@/lib/test-donation";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; health: HealthResponse }
  | { status: "error" };

type TestState = { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "error"; message: string };

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [donorName, setDonorName] = useState("夜雨");
  const [amount, setAmount] = useState(300);
  const [message, setMessage] = useState("這首歌我很喜歡");
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

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

  async function onTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestState({ status: "sending" });
    try {
      await sendTestDonation({ donorName, amountMinor: amount, message });
      setTestState({ status: "sent" });
    } catch (error) {
      setTestState({ status: "error", message: testDonationErrorMessage(error) });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <p className="text-xs tracking-[0.18em] text-cinnabar">營運</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">工作台</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          從這裡送出測試贊助、打開帳本，並把疊層網址貼進 OBS。測試事件不會寫進帳本。綠界與歐付寶還沒有開單。
        </p>
      </div>

      <HealthLine state={state} />

      <Card className="rounded-card border-line bg-paper-raised shadow-soft">
        <CardHeader>
          <CardTitle className="font-serif text-2xl font-medium">測試贊助</CardTitle>
          <CardDescription>送給已啟用的贊助提醒。畫面上會標成測試，帳本維持空白。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onTest} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="test-name">顯示名稱</Label>
              <Input id="test-name" maxLength={40} value={donorName} onChange={(event) => setDonorName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="test-amount">金額（新台幣）</Label>
              <Input
                id="test-amount"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="test-message">留言</Label>
              <Textarea
                id="test-message"
                maxLength={200}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
            <div className="flex flex-col items-start gap-3 md:col-span-2">
              <Button type="submit" className="h-10 px-4" disabled={testState.status === "sending"}>
                {testState.status === "sending" ? "送出中…" : "送出測試贊助"}
              </Button>
              {testState.status === "sent" ? (
                <p className="text-sm leading-6 text-ink" role="status">
                  已送出測試事件。這筆不會進入帳本。請先在外掛庫啟用「贊助提醒」，疊層才看得到。
                </p>
              ) : null}
              {testState.status === "error" ? (
                <p className="text-sm leading-6 text-cinnabar" role="status">
                  {testState.message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-card border-line bg-paper-raised shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-medium">帳本</CardTitle>
            <CardDescription>只列出真正入帳的贊助。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-ink-soft">
            付款外掛還沒有寫入任何一筆。
            <Link to="/donations" className="ml-1 text-indigo underline-offset-4 hover:underline">
              查看帳本
            </Link>
          </CardContent>
        </Card>
        <Card className="rounded-card border-line bg-paper-raised shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-medium">疊層</CardTitle>
            <CardDescription>OBS 瀏覽器來源使用權杖網址。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-ink-soft">
            重新產生之後，舊網址會失效。
            <Link to="/overlay" className="ml-1 text-indigo underline-offset-4 hover:underline">
              複製網址
            </Link>
          </CardContent>
        </Card>
        <Card className="rounded-card border-line bg-paper-raised shadow-soft">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-medium">外掛</CardTitle>
            <CardDescription>啟用、停用，以及密文設定。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-ink-soft">
            密文只會顯示已設定或尚未設定。
            <Link to="/plugins" className="ml-1 text-indigo underline-offset-4 hover:underline">
              打開外掛庫
            </Link>
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
        核心 API 沒有回應。請確認 `pnpm dev` 已啟動。
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
      <Badge variant="outline">即時通道已接上</Badge>
    </div>
  );
}
