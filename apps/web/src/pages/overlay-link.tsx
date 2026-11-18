import { useEffect, useState } from "react";
import { buttonClass, Note } from "@/components/fields";
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
  const chatPreview = link?.chatUrl ? withPreview(link.chatUrl) : null;

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
                <div className="ts-grid is-2-columns s4n-form-grid">
                  <UrlField id="overlay-url" label="贊助提醒網址" value={link.url} onCopy={() => void copy(link.url ?? "")} />
                  <UrlField
                    id="chat-overlay-url"
                    label="聊天疊層網址"
                    value={link.chatUrl ?? ""}
                    onCopy={() => void copy(link.chatUrl ?? "")}
                  />
                </div>
                <p className="ts-text is-description">
                  兩條網址共用同一組疊層權杖，差別只在 plugin。Twitch 的 Client ID 與 Client Secret 不會出現在這裡。
                </p>
                <div className="s4n-choices">
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
                      預覽贊助提醒
                    </a>
                  ) : null}
                  {chatPreview ? (
                    <a className={buttonClass({ variant: "outlined", icon: "start" })} href={chatPreview} target="_blank" rel="noreferrer">
                      <span className="ts-icon is-eye-icon" aria-hidden="true" />
                      預覽聊天疊層
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
        <li className="item">在外掛庫啟用「贊助提醒」。聊天另啟用「Twitch 聊天」與「聊天疊層」。</li>
        <li className="item">Twitch 聊天填頻道名稱。不填 Client ID 也能用匿名 justinfan 讀取。密文只顯示已設定或未設定。</li>
        <li className="item">OBS 新增來源，選擇瀏覽器。贊助提醒與聊天疊層各放一條網址。</li>
        <li className="item">寬度與高度跟預覽畫布相同，例如 1280×720，並勾選透明背景。OBS 不要加上 preview 參數。</li>
        <li className="item">
          在下方預覽送出測試贊助或測試聊天訊息。測試贊助不寫進帳本；要混進聊天時，先在聊天疊層打開「把贊助混進聊天」。
        </li>
      </ol>
    </div>
  );
}

function UrlField({ id, label, value, onCopy }: { id: string; label: string; value: string; onCopy: () => void }) {
  return (
    <div className="column s4n-stack">
      <label className="ts-text is-label" htmlFor={id}>
        {label}
      </label>
      <div className="ts-input s4n-mono">
        <input id={id} readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
      </div>
      <button type="button" className={buttonClass({ tone: "accent", size: "small", icon: "start" })} onClick={onCopy}>
        <span className="ts-icon is-copy-icon" aria-hidden="true" />
        複製網址
      </button>
    </div>
  );
}

function withPreview(value: string): string {
  const url = new URL(value);
  url.searchParams.set("preview", "1");
  return url.toString();
}
