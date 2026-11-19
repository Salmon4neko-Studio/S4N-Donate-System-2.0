import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { clampOverlayRect } from "@s4n/plugin-sdk";
import { buttonClass, choiceClass, Field, Note, TextArea, TextInput } from "@/components/fields";
import { type OverlaySlotState } from "@/lib/api";
import {
  CANVAS_PRESETS,
  containScale,
  overlayPreviewSrc,
  OVERLAY_PREVIEW_IFRAME,
  parseCanvasDimension,
  stageBackgroundAttr,
  stageImageRejection,
  visibleFileLabel,
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

export function OverlayPreviewPanel({
  pageUrl,
  width,
  height,
  slots,
  onCanvas,
  onSlots,
  onSave,
  saving,
}: {
  pageUrl: string | null;
  width: number;
  height: number;
  slots: OverlaySlotState[];
  onCanvas: (width: number, height: number) => void;
  onSlots: (slots: OverlaySlotState[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrl = useRef<string | null>(null);
  const [widthText, setWidthText] = useState(String(width));
  const [heightText, setHeightText] = useState(String(height));
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
    setWidthText(String(width));
    setHeightText(String(height));
  }, [width, height]);

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

  const paint = stageBackgroundAttr(mode, upload);
  const src = pageUrl === null ? null : overlayPreviewSrc(pageUrl);
  const alertsOnCanvas = slots.some((slot) => slot.pluginId === "official.alerts");
  const chatOnCanvas = slots.some((slot) => slot.pluginId === "official.chat-overlay");

  function applyCanvas(nextWidth: number, nextHeight: number) {
    setWidthText(String(nextWidth));
    setHeightText(String(nextHeight));
    setCanvasError(null);
    onCanvas(nextWidth, nextHeight);
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
    setCanvasError(null);
    onCanvas(parsedWidth, parsedHeight);
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

  function startDrag(event: ReactPointerEvent<HTMLElement>, pluginId: string, mode: "move" | "resize") {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const current = slots.find((slot) => slot.pluginId === pluginId);
    if (bounds === undefined || bounds.width === 0 || bounds.height === 0 || current === undefined) return;
    event.preventDefault();
    const origin = {
      x: event.clientX,
      y: event.clientY,
      rect: { x: current.x, y: current.y, width: current.width, height: current.height },
    };
    const snapshot = slots;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - origin.x) / bounds.width;
      const dy = (ev.clientY - origin.y) / bounds.height;
      const next = clampOverlayRect(
        mode === "move"
          ? { ...origin.rect, x: origin.rect.x + dx, y: origin.rect.y + dy }
          : { ...origin.rect, width: origin.rect.width + dx, height: origin.rect.height + dy },
      );
      onSlots(snapshot.map((slot) => (slot.pluginId === pluginId ? { ...slot, ...next } : slot)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function onTestChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            畫布設定
          </h2>
          <p className="ts-text is-description">
            寬度與高度必須和 OBS 的畫布，或這個瀏覽器來源的尺寸一致。位置用畫布寬高的比例儲存，所以改變尺寸時，區塊會跟著縮放，不會停在舊的像素上。
          </p>
        </div>

        <div className="s4n-stack">
          <p className="ts-text is-label">常用尺寸</p>
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
          {canvasError ? (
            <Note tone="danger">{canvasError}</Note>
          ) : (
            <p className="ts-text is-description">
              畫布 {width}×{height}。拖曳區塊後按儲存位置，疊層才會改過去。
            </p>
          )}
          <div className="s4n-choices">
            <button
              type="button"
              className={buttonClass({ tone: "accent", size: "small", icon: "start", loading: saving })}
              disabled={saving || canvasError !== null}
              onClick={onSave}
            >
              <span className="ts-icon is-check-icon" aria-hidden="true" />
              {saving ? "儲存中…" : "儲存位置"}
            </button>
          </div>
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

        {pageUrl === null ? <p className="ts-text is-description">先產生疊層網址，這裡才會載入 OBS 用的同一個疊層。</p> : null}
        {slots.length === 0 ? (
          <p className="ts-text is-description">啟用贊助提醒或聊天疊層後，畫布上會出現可拖曳的區塊。</p>
        ) : (
          <p className="ts-text is-description">橘色區塊是各外掛的位置。拖動後按儲存位置。右下角可以調整大小。</p>
        )}

        <div ref={stageRef} className="overlay-preview-stage" data-bg={paint.bg} style={stageStyle}>
          <div ref={canvasRef} className="overlay-preview-canvas" style={{ width, height, transform: scale > 0 ? `scale(${scale})` : undefined }}>
            {src !== null && scale > 0 ? (
              <iframe
                title="疊層預覽"
                src={src}
                sandbox={OVERLAY_PREVIEW_IFRAME.sandbox}
                referrerPolicy={OVERLAY_PREVIEW_IFRAME.referrerPolicy}
                tabIndex={-1}
              />
            ) : null}
            {slots.map((slot) => (
              <div
                key={slot.pluginId}
                className="overlay-slot-editor"
                style={{
                  left: `${slot.x * 100}%`,
                  top: `${slot.y * 100}%`,
                  width: `${slot.width * 100}%`,
                  height: `${slot.height * 100}%`,
                }}
                onPointerDown={(event) => startDrag(event, slot.pluginId, "move")}
              >
                <span>{slot.name}</span>
                <button
                  type="button"
                  className="overlay-slot-resize"
                  aria-label={`調整${slot.name}大小`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    startDrag(event, slot.pluginId, "resize");
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={onTest} className="ts-grid is-2-columns s4n-form-grid">
          <div className="column is-wide">
            <p className="ts-text is-label">測試贊助</p>
            <p className="ts-text is-description">跟工作台同一條測試路徑，不會寫進帳本。</p>
          </div>
          <div className="column">
            <Field id="preview-donor-name" label="顯示名稱">
              <TextInput id="preview-donor-name" maxLength={40} value={donorName} onChange={(event) => setDonorName(event.target.value)} />
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
            <button
              type="submit"
              className={buttonClass({ tone: "accent", size: "small", icon: "start", loading: testState.status === "sending" })}
              disabled={testState.status === "sending"}
            >
              <span className="ts-icon is-paper-plane-icon" aria-hidden="true" />
              {testState.status === "sending" ? "送出中…" : "送出測試贊助"}
            </button>
            {testState.status === "sent" ? <Note>{sentMessage(alertsOnCanvas)}</Note> : null}
            {testState.status === "error" ? <Note tone="danger">{testState.message}</Note> : null}
          </div>
        </form>

        <form onSubmit={onTestChat} className="ts-grid is-2-columns s4n-form-grid">
          <div className="column is-wide">
            <p className="ts-text is-label">測試聊天訊息</p>
            <p className="ts-text is-description">不連到 Twitch，也不寫進帳本。訊息會帶實況主與管理員徽章，以及 Kappa 表情，方便確認畫面。</p>
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
            {chatState.status === "sent" ? <Note>{chatSentMessage(chatOnCanvas)}</Note> : null}
            {chatState.status === "error" ? <Note tone="danger">{chatState.message}</Note> : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function chatSentMessage(chatOnCanvas: boolean): string {
  if (!chatOnCanvas) return "已送出測試聊天。這筆不會進入帳本。聊天疊層目前沒有放在畫布上。";
  return "已送出測試聊天。這筆不會進入帳本。訊息會出現在聊天區塊裡。";
}

function sentMessage(alertsOnCanvas: boolean): string {
  if (!alertsOnCanvas) return "已送出測試事件。這筆不會進入帳本。贊助提醒目前沒有放在畫布上。";
  return "已送出測試事件。這筆不會進入帳本。提醒會出現在贊助區塊裡。";
}
