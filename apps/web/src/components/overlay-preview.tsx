import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { buttonClass, choiceClass, Field, Note, TextArea, TextInput } from "@/components/fields";
import { api, type PluginSummary } from "@/lib/api";
import {
  ALERTS_PLUGIN_ID,
  CHAT_OVERLAY_PLUGIN_ID,
  CANVAS_PRESETS,
  choiceNeedsSceneNote,
  containScale,
  defaultPreviewChoiceId,
  overlayPreviewSrc,
  OVERLAY_PREVIEW_IFRAME,
  parseCanvasDimension,
  previewChoices,
  stageBackgroundAttr,
  stageImageRejection,
  visibleFileLabel,
  type PreviewChoice,
  type StageBackground,
} from "@/lib/overlay-preview";
import { sendTestChat, testChatErrorMessage } from "@/lib/test-chat";
import { sendTestDonation, testDonationErrorMessage } from "@/lib/test-donation";
import "./overlay-preview.css";

const BACKGROUNDS: { id: StageBackground; label: string }[] = [
  { id: "dark", label: "深色棋盤" },
  { id: "light", label: "淺色棋盤" },
  { id: "green", label: "純綠" },
  { id: "sample", label: "範例畫面" },
];

type TestState = { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "error"; message: string };

export function OverlayPreviewPanel({ pageUrl, pluginId }: { pageUrl: string | null; pluginId: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrl = useRef<string | null>(null);
  const [plugins, setPlugins] = useState<PluginSummary[] | null>(null);
  const [pluginsFailed, setPluginsFailed] = useState(false);
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [widthText, setWidthText] = useState("1920");
  const [heightText, setHeightText] = useState("1080");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [mode, setMode] = useState<StageBackground>("dark");
  const [upload, setUpload] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [scale, setScale] = useState(0);
  const [donorName, setDonorName] = useState("小滿");
  const [amount, setAmount] = useState(520);
  const [message, setMessage] = useState("從預覽送出");
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [chatName, setChatName] = useState("測試觀眾");
  const [chatText, setChatText] = useState("大家好");
  const [chatState, setChatState] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    api<{ plugins: PluginSummary[] }>("/api/plugins", { signal: controller.signal })
      .then((body) => {
        setPlugins(body.plugins);
        setPluginsFailed(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPluginsFailed(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (uploadUrl.current !== null) URL.revokeObjectURL(uploadUrl.current);
    };
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (element === null) return;
    const update = () => {
      const next = containScale(element.clientWidth, element.clientHeight, width, height);
      if (next > 0) setScale(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  const choices = previewChoices(plugins, pluginId);
  const activeId =
    choiceId !== null && choices.some((choice) => choice.id === choiceId)
      ? choiceId
      : defaultPreviewChoiceId(choices, pluginId);
  const active = choices.find((choice) => choice.id === activeId) ?? null;
  const paint = stageBackgroundAttr(mode, upload);
  const frames =
    pageUrl === null || scale <= 0
      ? []
      : (active?.pluginIds ?? []).flatMap((id) => {
          const src = overlayPreviewSrc(pageUrl, id);
          return src === null ? [] : [{ id, src }];
        });
  const alertsEnabled = plugins === null ? null : plugins.some((plugin) => plugin.id === ALERTS_PLUGIN_ID && plugin.enabled);
  const chatEnabled = plugins === null ? null : plugins.some((plugin) => plugin.id === CHAT_OVERLAY_PLUGIN_ID && plugin.enabled);

  function applyCanvas(nextWidth: number, nextHeight: number) {
    setWidth(nextWidth);
    setHeight(nextHeight);
    setWidthText(String(nextWidth));
    setHeightText(String(nextHeight));
    setCanvasError(null);
  }

  function onDimension(which: "width" | "height", raw: string) {
    const nextWidthText = which === "width" ? raw : widthText;
    const nextHeightText = which === "height" ? raw : heightText;
    if (which === "width") setWidthText(raw);
    else setHeightText(raw);
    const parsedWidth = parseCanvasDimension(nextWidthText);
    const parsedHeight = parseCanvasDimension(nextHeightText);
    if (parsedWidth === null || parsedHeight === null) {
      setCanvasError("寬度與高度要是 160 到 4096 的整數。");
      return;
    }
    setWidth(parsedWidth);
    setHeight(parsedHeight);
    setCanvasError(null);
  }

  function replaceUpload(next: string | null) {
    if (uploadUrl.current !== null) URL.revokeObjectURL(uploadUrl.current);
    uploadUrl.current = next;
    setUpload(next);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const rejection = stageImageRejection(file);
    if (rejection === "type") {
      setImageError("請選擇 PNG、JPEG、WEBP 或 GIF。");
      return;
    }
    if (rejection === "size") {
      setImageError("圖片請小於 8 MB。檔案只會留在這個瀏覽器。");
      return;
    }
    replaceUpload(URL.createObjectURL(file));
    setFileLabel(visibleFileLabel(file.name));
    setMode("upload");
    setImageError(null);
  }

  async function onTestChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chatChoice = choices.find((choice) => choice.id === CHAT_OVERLAY_PLUGIN_ID);
    if (chatChoice) setChoiceId(chatChoice.id);
    setChatState({ status: "sending" });
    try {
      await sendTestChat({ displayName: chatName, text: chatText });
      setChatState({ status: "sent" });
    } catch (error) {
      setChatState({ status: "error", message: testChatErrorMessage(error) });
    }
  }

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

  const stageStyle = {
    "--canvas-w": String(width),
    "--canvas-h": String(height),
    ...(paint.image !== null ? { "--stage-image": `url("${paint.image}")` } : {}),
  } as CSSProperties;

  return (
    <section className="ts-box is-raised" aria-labelledby="overlay-preview-title">
      <div className="ts-content is-padded s4n-stack">
        <div>
          <h2 id="overlay-preview-title" className="ts-header is-start-icon">
            <span className="ts-icon is-eye-icon" aria-hidden="true" />
            OBS 預覽
          </h2>
          <p className="ts-text is-description">載入 OBS 會開啟的同一個疊層，並依畫布比例縮小。透明的地方會露出你選的背景。</p>
        </div>

        <div className="s4n-stack">
          <p className="ts-text is-label">畫布</p>
          <div className="s4n-choices">
            {CANVAS_PRESETS.map((preset) => {
              const selected = width === preset.width && height === preset.height;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={choiceClass(selected, "small")}
                  aria-pressed={selected}
                  onClick={() => applyCanvas(preset.width, preset.height)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="s4n-dimensions">
            <div className="s4n-dimension">
              <Field id="preview-width" label="寬度">
                <TextInput
                  id="preview-width"
                  inputMode="numeric"
                  value={widthText}
                  onChange={(event) => onDimension("width", event.target.value)}
                />
              </Field>
            </div>
            <div className="s4n-dimension">
              <Field id="preview-height" label="高度">
                <TextInput
                  id="preview-height"
                  inputMode="numeric"
                  value={heightText}
                  onChange={(event) => onDimension("height", event.target.value)}
                />
              </Field>
            </div>
          </div>
          {canvasError ? <Note tone="danger">{canvasError}</Note> : <p className="ts-text is-description">畫布 {width}×{height}，縮小後放進這個面板。</p>}
        </div>

        <div className="s4n-stack">
          <p className="ts-text is-label">背景</p>
          <div className="s4n-choices">
            {BACKGROUNDS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={choiceClass(mode === item.id, "small")}
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={choiceClass(mode === "upload", "small")}
              aria-pressed={mode === "upload"}
              onClick={() => fileRef.current?.click()}
            >
              上傳圖片
            </button>
            <input
              ref={fileRef}
              className="s4n-visually-hidden"
              type="file"
              tabIndex={-1}
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onFile}
            />
            {upload !== null ? (
              <button
                type="button"
                className={buttonClass({ variant: "outlined", size: "small" })}
                onClick={() => {
                  replaceUpload(null);
                  setFileLabel("");
                  if (mode === "upload") setMode("dark");
                }}
              >
                清除
              </button>
            ) : null}
          </div>
          <p className="ts-text is-description">範例與上傳的圖片只留在這個瀏覽器，不會送到伺服器。</p>
          {mode === "upload" && fileLabel !== "" ? <p className="ts-text is-description is-truncated">{fileLabel}</p> : null}
          {imageError ? <Note tone="danger">{imageError}</Note> : null}
        </div>

        {choices.length > 1 ? (
          <div className="s4n-stack">
            <p className="ts-text is-label">疊層外掛</p>
            <div className="s4n-choices">
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={choiceClass(choice.id === activeId, "small")}
                  aria-pressed={choice.id === activeId}
                  onClick={() => setChoiceId(choice.id)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="ts-text is-description">一次看一個，或全部疊加，接近 OBS 把多個瀏覽器來源放在同一塊畫布。</p>
          </div>
        ) : null}
        {pluginsFailed ? <p className="ts-text is-description">讀不到外掛清單，先顯示這條網址。</p> : null}

        {pageUrl === null ? <p className="ts-text is-description">先產生疊層網址，這裡才會載入 OBS 用的同一個疊層。</p> : null}
        {choiceNeedsSceneNote(active) ? (
          <p className="ts-text is-description">這個外掛還沒有自己的疊層畫面。預覽跟 OBS 一樣，目前是透明的。</p>
        ) : null}

        <div ref={stageRef} className="overlay-preview-stage" data-bg={paint.bg} style={stageStyle}>
          {frames.map((frame) => (
            <iframe
              key={frame.id}
              title={frameTitle(frame.id, choices)}
              src={frame.src}
              sandbox={OVERLAY_PREVIEW_IFRAME.sandbox}
              referrerPolicy={OVERLAY_PREVIEW_IFRAME.referrerPolicy}
              tabIndex={-1}
              style={{ width, height, transform: `scale(${scale})` }}
            />
          ))}
        </div>

        <form onSubmit={onTest} className="ts-grid is-2-columns s4n-form-grid">
          <div className="column is-wide">
            <p className="ts-text is-label">測試贊助</p>
            <p className="ts-text is-description">跟工作台同一條測試路徑，不會寫進帳本。</p>
          </div>
          <div className="column">
            <Field id="preview-donor-name" label="顯示名稱">
              <TextInput
                id="preview-donor-name"
                maxLength={40}
                value={donorName}
                onChange={(event) => setDonorName(event.target.value)}
              />
            </Field>
          </div>
          <div className="column">
            <Field id="preview-amount" label="金額（新台幣）">
              <TextInput
                id="preview-amount"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="column is-wide">
            <Field id="preview-message" label="留言">
              <TextArea id="preview-message" maxLength={200} value={message} onChange={(event) => setMessage(event.target.value)} />
            </Field>
          </div>
          <div className="column is-wide s4n-fields">
            <button type="submit" className={buttonClass({ tone: "accent", size: "small", icon: "start", loading: testState.status === "sending" })} disabled={testState.status === "sending"}>
              <span className="ts-icon is-paper-plane-icon" aria-hidden="true" />
              {testState.status === "sending" ? "送出中…" : "送出測試贊助"}
            </button>
            {testState.status === "sent" ? <Note>{sentMessage(alertsEnabled)}</Note> : null}
            {testState.status === "error" ? <Note tone="danger">{testState.message}</Note> : null}
          </div>
        </form>

        <form onSubmit={onTestChat} className="ts-grid is-2-columns s4n-form-grid">
          <div className="column is-wide">
            <p className="ts-text is-label">測試聊天訊息</p>
            <p className="ts-text is-description">
              不連到 Twitch，也不寫進帳本。訊息會帶實況主與管理員徽章，以及 Kappa 表情，方便確認畫面。
            </p>
          </div>
          <div className="column">
            <Field id="preview-chat-name" label="顯示名稱">
              <TextInput id="preview-chat-name" maxLength={40} value={chatName} onChange={(event) => setChatName(event.target.value)} />
            </Field>
          </div>
          <div className="column">
            <Field id="preview-chat-text" label="訊息">
              <TextInput id="preview-chat-text" maxLength={180} value={chatText} onChange={(event) => setChatText(event.target.value)} />
            </Field>
          </div>
          <div className="column is-wide s4n-fields">
            <button
              type="submit"
              className={buttonClass({ tone: "accent", size: "small", icon: "start", loading: chatState.status === "sending" })}
              disabled={chatState.status === "sending"}
            >
              <span className="ts-icon is-comment-icon" aria-hidden="true" />
              {chatState.status === "sending" ? "送出中…" : "送出測試聊天訊息"}
            </button>
            {chatState.status === "sent" ? <Note>{chatSentMessage(chatEnabled)}</Note> : null}
            {chatState.status === "error" ? <Note tone="danger">{chatState.message}</Note> : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function frameTitle(pluginId: string, choices: readonly PreviewChoice[]): string {
  const label = choices.find((choice) => choice.id === pluginId)?.label ?? "疊層";
  return `疊層預覽，${label}`;
}

function chatSentMessage(chatEnabled: boolean | null): string {
  if (chatEnabled === false) {
    return "已送出測試聊天。這筆不會進入帳本。「聊天疊層」目前停用，所以預覽不會出現。";
  }
  if (chatEnabled === true) return "已送出測試聊天。這筆不會進入帳本。訊息會出現在聊天疊層。";
  return "已送出測試聊天。這筆不會進入帳本。";
}

function sentMessage(alertsEnabled: boolean | null): string {
  if (alertsEnabled === false) {
    return "已送出測試事件。這筆不會進入帳本。「贊助提醒」目前停用，所以預覽不會出現提醒。";
  }
  if (alertsEnabled === true) return "已送出測試事件。這筆不會進入帳本。提醒會出現在預覽裡。";
  return "已送出測試事件。這筆不會進入帳本。";
}
