import { useEffect, useState } from "react";
import { Link } from "react-router";
import { OverlayPreviewPanel } from "@/components/overlay-preview";
import { Button } from "@/components/ui/button";
import { api, type OverlayLink } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; link: OverlayLink }
  | { status: "error" };

export function OverlayLinkPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<OverlayLink>("/api/overlay", { signal: controller.signal })
      .then((link) => setState({ status: "ready", link }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  async function regenerate() {
    setPending(true);
    setNotice(null);
    try {
      const link = await api<OverlayLink>("/api/overlay/token", { method: "POST" });
      setState({ status: "ready", link });
      setConfirming(false);
      setNotice("已產生新網址。舊網址立即失效。");
    } catch {
      setNotice("沒有產生新網址。");
    } finally {
      setPending(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("已複製 OBS 網址。");
    } catch {
      setNotice("瀏覽器沒有允許複製，請自行選取網址。");
    }
  }

  const link = state.status === "ready" ? state.link : null;
  const preview = link?.url ? withPreview(link.url) : null;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <p className="text-xs tracking-[0.18em] text-cinnabar">疊層</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">OBS 瀏覽器來源</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          這段網址就是通行權杖。請把它貼進 OBS，不要貼到公開的地方。重新產生會使舊網址失效。疊層不使用登入 Cookie。
        </p>
      </div>

      {state.status === "loading" ? <p className="text-sm text-ink-soft">正在讀取疊層網址…</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-cinnabar" role="status">
          讀不到疊層網址。
        </p>
      ) : null}

      {link ? (
        <section className="rounded-card border border-line bg-paper-raised p-6 shadow-soft">
          {link.url ? (
            <div className="flex flex-col gap-4">
              <label className="text-sm text-ink" htmlFor="overlay-url">
                貼進 OBS 的網址
              </label>
              <input
                id="overlay-url"
                readOnly
                value={link.url}
                className="h-11 w-full rounded-lg border border-input bg-paper px-3 font-mono text-xs text-ink"
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-10 px-4" onClick={() => void copy(link.url ?? "")}>
                  複製網址
                </Button>
                {confirming ? (
                  <Button type="button" variant="outline" className="h-10 px-4" disabled={pending} onClick={() => void regenerate()}>
                    {pending ? "產生中…" : "確定讓舊網址失效"}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" className="h-10 px-4" onClick={() => setConfirming(true)}>
                    重新產生
                  </Button>
                )}
                {preview ? (
                  <a
                    href={preview}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-indigo underline-offset-4 hover:underline"
                  >
                    在這個瀏覽器預覽
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm leading-6 text-ink-soft">還沒有疊層網址。</p>
              <Button type="button" className="h-10 px-4" disabled={pending} onClick={() => void regenerate()}>
                {pending ? "產生中…" : "產生疊層網址"}
              </Button>
            </div>
          )}
          {notice ? (
            <p className="mt-4 text-sm text-ink" role="status">
              {notice}
            </p>
          ) : null}
        </section>
      ) : null}

      {state.status !== "loading" ? (
        <OverlayPreviewPanel pageUrl={link?.url ?? null} pluginId={link?.pluginId ?? "official.alerts"} />
      ) : null}

      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-6 text-ink-soft">
        <li>在外掛庫啟用「贊助提醒」。</li>
        <li>OBS 新增來源，選擇瀏覽器。</li>
        <li>貼上上面的網址。寬度與高度跟預覽畫布相同，例如 1280×720。</li>
        <li>勾選透明背景。OBS 不要加上 preview 參數。</li>
        <li>
          在下方預覽送出測試贊助，或回到
          <Link to="/" className="mx-1 text-indigo underline-offset-4 hover:underline">
            工作台
          </Link>
          送出，確認提醒出現。
        </li>
      </ol>
    </div>
  );
}

function withPreview(value: string): string {
  const url = new URL(value);
  url.searchParams.set("preview", "1");
  return url.toString();
}
