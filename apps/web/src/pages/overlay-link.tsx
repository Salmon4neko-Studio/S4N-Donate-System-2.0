import { useEffect, useState } from "react";
import { buttonClass, Note } from "@/components/fields";
import { OverlayPreviewPanel } from "@/components/overlay-preview";
import { api, type OverlayLink, type OverlaySlotState } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; link: OverlayLink }
  | { status: "error" };

export function OverlayLinkPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [canvas, setCanvas] = useState({ width: 1920, height: 1080 });
  const [slots, setSlots] = useState<OverlaySlotState[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<OverlayLink>("/api/overlay", { signal: controller.signal })
      .then((link) => {
        setState({ status: "ready", link });
        applyLayout(link);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  function applyLayout(link: OverlayLink) {
    setCanvas(link.canvas);
    setSlots(link.slots);
  }

  async function regenerate() {
    setPending(true);
    setNotice(null);
    try {
      const link = await api<OverlayLink>("/api/overlay/token", { method: "POST" });
      setState({ status: "ready", link });
      applyLayout(link);
      setConfirming(false);
      setNotice("已產生新網址。舊網址立即失效。");
    } catch {
      setNotice("沒有產生新網址。");
    } finally {
      setPending(false);
    }
  }

  async function saveLayout() {
    setSaving(true);
    setNotice(null);
    const body = {
      width: canvas.width,
      height: canvas.height,
      slots: Object.fromEntries(slots.map((slot) => [slot.pluginId, { x: slot.x, y: slot.y, width: slot.width, height: slot.height }])),
    };
    try {
      const link = await api<OverlayLink>("/api/overlay/layout", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setState({ status: "ready", link });
      applyLayout(link);
      setNotice("已儲存畫布與位置。疊層會在幾秒內跟著移動。");
    } catch {
      setNotice("位置沒有儲存。請確認區塊都在畫布裡面。");
    } finally {
      setSaving(false);
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
          這一條網址就是通行權杖。OBS 只要加一個瀏覽器來源。已啟用、而且宣告需要疊層的外掛會畫在同一張畫布上。重新產生會使舊網址失效。疊層不使用登入 Cookie。
        </p>
      </header>

      {state.status === "loading" ? <p className="ts-text is-description">正在讀取疊層網址…</p> : null}
      {state.status === "error" ? <Note tone="danger">讀不到疊層網址。</Note> : null}

      {link ? (
        <section className="ts-box is-raised">
          <div className="ts-content is-padded s4n-stack">
            {link.url ? (
              <>
                <UrlField id="overlay-url" label="OBS 網址" value={link.url} onCopy={() => void copy(link.url ?? "")} />
                <p className="ts-text is-description">
                  以前分開的贊助提醒與聊天網址會打開同一張畫布，網址上的 plugin 不再分開畫面。Twitch 的 Client ID 與 Client Secret 不會出現在這裡。
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
                      預覽疊層
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
        <OverlayPreviewPanel
          pageUrl={link?.url ?? null}
          width={canvas.width}
          height={canvas.height}
          slots={slots}
          onCanvas={(nextWidth, nextHeight) => setCanvas({ width: nextWidth, height: nextHeight })}
          onSlots={setSlots}
          onSave={() => void saveLayout()}
          saving={saving}
        />
      ) : null}

      <ol className="ts-list is-ordered">
        <li className="item">在外掛頁啟用「贊助提醒」。聊天另啟用「Twitch 聊天」與「聊天疊層」。範本、顏色、動畫與聊天選項在側欄的外掛選單。</li>
        <li className="item">Twitch 的頻道名稱在側欄的 Twitch 聊天。Client ID 與 Client Secret 在外掛頁，只顯示已設定或未設定。不填也能用匿名 justinfan 讀取。</li>
        <li className="item">OBS 新增一個瀏覽器來源，貼上這一條網址。寬高跟畫布相同，例如 1920×1080，並勾選透明背景。不要加上 preview。</li>
        <li className="item">在畫布上把贊助提醒和聊天拖到想要的位置，按儲存位置。位置是比例，之後改畫布尺寸會跟著縮放。</li>
        <li className="item">在下方送出測試贊助或測試聊天。測試贊助不寫進帳本；要混進聊天時，先在聊天疊層打開「把贊助混進聊天」。</li>
      </ol>
    </div>
  );
}

function UrlField({ id, label, value, onCopy }: { id: string; label: string; value: string; onCopy: () => void }) {
  return (
    <div className="s4n-stack">
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
