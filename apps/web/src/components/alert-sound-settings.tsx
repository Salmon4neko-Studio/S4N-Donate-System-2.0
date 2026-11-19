import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { buttonClass, Hint, Note } from "@/components/fields";

export function AlertSoundSettings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [configured, setConfigured] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(signal?: AbortSignal) {
    try {
      const next = await readSound(signal);
      setConfigured(next !== null);
      setPreviewUrl(next);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/plugins/official.alerts/sound", {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) {
        setError(response.status === 422 ? "只接受 2 MB 以內、檔頭相符的 mp3、ogg 或 wav。" : "音效沒有上傳。");
        return;
      }
      await refresh();
      setNotice("已上傳。沒有音效時疊層維持靜音。");
    } catch {
      setError("音效沒有上傳。");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/plugins/official.alerts/sound", { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        setError("音效沒有移除。");
        return;
      }
      setConfigured(false);
      setPreviewUrl((current) => {
        if (current !== null) URL.revokeObjectURL(current);
        return null;
      });
      setNotice("已移除。提醒會保持靜音。");
    } catch {
      setError("音效沒有移除。");
    } finally {
      setPending(false);
    }
  }

  function preview() {
    const audio = audioRef.current;
    if (audio === null) return;
    audio.volume = previewVolume();
    void audio.play().catch(() => setError("瀏覽器沒有播放這個音效。"));
  }

  return (
    <section className="s4n-sound" aria-label="提示音">
      <h2 className="ts-header">提示音</h2>
      <Hint>mp3、ogg 或 wav，最大 2 MB。伺服器會核對檔頭，不看副檔名。音量用上面的欄位，0 到 100。沒有音效時疊層維持靜音。</Hint>
      <Hint>OBS 的瀏覽器來源若沒有聲音，請在來源屬性勾選「透過 OBS 控制音訊」。</Hint>
      <p className="ts-text">{configured ? "已上傳音效。" : "尚未上傳，提醒維持靜音。"}</p>
      <div className="s4n-choices">
        <input ref={fileRef} className="s4n-file-input" type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" onChange={(event) => void onFile(event)} />
        <button type="button" className={buttonClass({ tone: "accent", loading: pending })} disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? "處理中…" : configured ? "更換音效" : "上傳音效"}
        </button>
        <button type="button" className={buttonClass({ variant: "outlined" })} disabled={!configured || previewUrl === null} onClick={preview}>
          試聽
        </button>
        <button type="button" className={buttonClass({ variant: "outlined" })} disabled={!configured || pending} onClick={() => void remove()}>
          移除音效
        </button>
      </div>
      {previewUrl ? <audio ref={audioRef} src={previewUrl} preload="auto" /> : null}
      {notice ? <Note>{notice}</Note> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
    </section>
  );
}

function previewVolume(): number {
  const input = document.getElementById("official.alerts-volume");
  if (!(input instanceof HTMLInputElement)) return 0.8;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return 0.8;
  return Math.min(100, Math.max(0, value)) / 100;
}

async function readSound(signal?: AbortSignal): Promise<string | null> {
  const response = await fetch("/api/plugins/official.alerts/sound", { credentials: "include", signal });
  if (response.status === 404 || !response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
