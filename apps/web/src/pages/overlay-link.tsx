import { useEffect, useState } from "react";
import { Link } from "react-router";
import { buttonClass, Note, TextInput } from "@/components/fields";
import { OverlayPreviewPanel } from "@/components/overlay-preview";
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
    <div className="s4n-stack is-loose">
      <header className="s4n-intro">
        <p className="s4n-kicker">疊層</p>
        <h1 className="ts-header is-huge">OBS 瀏覽器來源</h1>
        <p className="ts-text is-description s4n-lede">
          這段網址就是通行權杖。請把它貼進 OBS，不要貼到公開的地方。重新產生會使舊網址失效。疊層不使用登入 Cookie。
        </p>
      </header>

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取疊層網址…</p> : null}
      {state.status === "error" ? <Note tone="danger">讀不到疊層網址。</Note> : null}

      {link ? (
        <section className="ts-box is-raised">
          <div className="ts-content is-padded s4n-stack">
            {link.url ? (
              <>
                <label className="ts-text is-label" htmlFor="overlay-url">
                  貼進 OBS 的網址
                </label>
                <div className="ts-input s4n-mono">
                  <input id="overlay-url" readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} />
                </div>
                <div className="s4n-choices">
                  <button type="button" className={buttonClass({ tone: "accent", icon: "start" })} onClick={() => void copy(link.url ?? "")}>
                    <span className="ts-icon is-copy-icon" aria-hidden="true" />
                    複製網址
                  </button>
                  {confirming ? (
                    <button
                      type="button"
                      className={`${buttonClass({ variant: "outlined", loading: pending })} is-negative`}
                      disabled={pending}
                      onClick={() => void regenerate()}
                    >
                      {pending ? "產生中…" : "確定讓舊網址失效"}
                    </button>
                  ) : (
                    <button type="button" className={buttonClass({ variant: "outlined" })} onClick={() => setConfirming(true)}>
                      重新產生
                    </button>
                  )}
                  {preview ? (
                    <a className={buttonClass({ variant: "outlined", icon: "start" })} href={preview} target="_blank" rel="noreferrer">
                      <span className="ts-icon is-eye-icon" aria-hidden="true" />
                      在這個瀏覽器預覽
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="s4n-fields">
                <p className="ts-text is-description">還沒有疊層網址。</p>
                <button
                  type="button"
                  className={buttonClass({ tone: "accent", icon: "start", loading: pending })}
                  disabled={pending}
                  onClick={() => void regenerate()}
                >
                  <span className="ts-icon is-link-icon" aria-hidden="true" />
                  {pending ? "產生中…" : "產生疊層網址"}
                </button>
              </div>
            )}
            {notice ? <Note>{notice}</Note> : null}
          </div>
        </section>
      ) : null}

      {state.status !== "loading" ? (
        <OverlayPreviewPanel pageUrl={link?.url ?? null} pluginId={link?.pluginId ?? "official.alerts"} />
      ) : null}

      <ol className="ts-list is-ordered">
        <li className="item">在外掛庫啟用「贊助提醒」。</li>
        <li className="item">OBS 新增來源，選擇瀏覽器。</li>
        <li className="item">貼上上面的網址。寬度與高度跟預覽畫布相同，例如 1280×720。</li>
        <li className="item">勾選透明背景。OBS 不要加上 preview 參數。</li>
        <li className="item">
          在下方預覽送出測試贊助，或回到
          <Link to="/" className="ts-text is-link">
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
