import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type PluginSummary } from "@/lib/api";
import {
  ALERTS_PLUGIN_ID,
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
    <section className="flex flex-col gap-4 rounded-card border border-line bg-paper-raised p-6 shadow-soft" aria-labelledby="overlay-preview-title">
      <div>
        <h2 id="overlay-preview-title" className="text-base font-medium">
          OBS 預覽
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          載入 OBS 會開啟的同一個疊層，並依畫布比例縮小。透明的地方會露出你選的背景。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">畫布</p>
        <div className="flex flex-wrap gap-2">
          {CANVAS_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={width === preset.width && height === preset.height ? "default" : "outline"}
              aria-pressed={width === preset.width && height === preset.height}
              onClick={() => applyCanvas(preset.width, preset.height)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="preview-width">寬度</Label>
            <Input
              id="preview-width"
              inputMode="numeric"
              value={widthText}
              className="w-28"
              onChange={(event) => onDimension("width", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="preview-height">高度</Label>
            <Input
              id="preview-height"
              inputMode="numeric"
              value={heightText}
              className="w-28"
              onChange={(event) => onDimension("height", event.target.value)}
            />
          </div>
        </div>
        {canvasError ? (
          <p className="text-sm text-cinnabar" role="status">
            {canvasError}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            畫布 {width}×{height}，縮小後放進這個面板。
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">背景</p>
        <div className="flex flex-wrap gap-2">
          {BACKGROUNDS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={mode === item.id ? "default" : "outline"}
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={mode === "upload" ? "default" : "outline"}
            aria-pressed={mode === "upload"}
            onClick={() => fileRef.current?.click()}
          >
            上傳圖片
          </Button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            tabIndex={-1}
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFile}
          />
          {upload !== null ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                replaceUpload(null);
                setFileLabel("");
                if (mode === "upload") setMode("dark");
              }}
            >
              清除
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-ink-soft">範例與上傳的圖片只留在這個瀏覽器，不會送到伺服器。</p>
        {mode === "upload" && fileLabel !== "" ? <p className="truncate text-sm text-ink-soft">{fileLabel}</p> : null}
        {imageError ? (
          <p className="text-sm text-cinnabar" role="status">
            {imageError}
          </p>
        ) : null}
      </div>

      {choices.length > 1 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">疊層外掛</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.id}
                type="button"
                size="sm"
                variant={choice.id === activeId ? "default" : "outline"}
                aria-pressed={choice.id === activeId}
                onClick={() => setChoiceId(choice.id)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-ink-soft">一次看一個，或全部疊加，接近 OBS 把多個瀏覽器來源放在同一塊畫布。</p>
        </div>
      ) : null}
      {pluginsFailed ? <p className="text-sm text-ink-soft">讀不到外掛清單，先顯示這條網址。</p> : null}

      {pageUrl === null ? (
        <p className="text-sm text-ink-soft">先產生疊層網址，這裡才會載入 OBS 用的同一個疊層。</p>
      ) : null}
      {choiceNeedsSceneNote(active) ? (
        <p className="text-sm text-ink-soft">這個外掛還沒有自己的疊層畫面。預覽跟 OBS 一樣，目前是透明的。</p>
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

      <form onSubmit={onTest} className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 md:col-span-2">
          <p className="text-sm font-medium">測試贊助</p>
          <p className="text-sm text-ink-soft">跟工作台同一條測試路徑，不會寫進帳本。</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="preview-donor-name">顯示名稱</Label>
          <Input
            id="preview-donor-name"
            maxLength={40}
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="preview-amount">金額（新台幣）</Label>
          <Input
            id="preview-amount"
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor="preview-message">留言</Label>
          <Textarea
            id="preview-message"
            maxLength={200}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <div className="flex flex-col items-start gap-2 md:col-span-2">
          <Button type="submit" size="sm" disabled={testState.status === "sending"}>
            {testState.status === "sending" ? "送出中…" : "送出測試贊助"}
          </Button>
          {testState.status === "sent" ? (
            <p className="text-sm text-ink" role="status">
              {sentMessage(alertsEnabled)}
            </p>
          ) : null}
          {testState.status === "error" ? (
            <p className="text-sm text-cinnabar" role="status">
              {testState.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function frameTitle(pluginId: string, choices: readonly PreviewChoice[]): string {
  const label = choices.find((choice) => choice.id === pluginId)?.label ?? "疊層";
  return `疊層預覽，${label}`;
}

function sentMessage(alertsEnabled: boolean | null): string {
  if (alertsEnabled === false) {
    return "已送出測試事件。這筆不會進入帳本。「贊助提醒」目前停用，所以預覽不會出現提醒。";
  }
  if (alertsEnabled === true) return "已送出測試事件。這筆不會進入帳本。提醒會出現在預覽裡。";
  return "已送出測試事件。這筆不會進入帳本。";
}
