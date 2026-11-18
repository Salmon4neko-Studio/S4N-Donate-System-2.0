import { useEffect, useState, type FormEvent } from "react";
import { buttonClass, Field, Hint, Note, TextArea, TextInput } from "@/components/fields";
import { ApiError, api, type PluginSummary, type SettingsFieldState } from "@/lib/api";

const kindLabel: Record<string, string> = {
  overlay: "疊層",
  dashboard: "儀表板",
  connector: "連接器",
  payment: "付款",
  processor: "處理器",
};

const permissionLabel: Record<string, string> = {
  "events.subscribe": "訂閱事件",
  "events.emit": "發送事件",
  "overlay.slot": "疊層版位",
  "dashboard.settings": "儀表板設定",
  "tts.speak": "語音",
  "payments.read": "讀取帳本",
  "payments.provider": "付款提供者",
  secrets: "密鑰",
  network: "對外網路",
};

const enumLabel: Record<string, string> = {
  stage: "測試站",
  production: "正式站",
  slow: "慢",
  medium: "中",
};

export function PluginCard({ plugin, settingsOpen }: { plugin: PluginSummary; settingsOpen?: boolean }) {
  const [enabled, setEnabled] = useState(plugin.enabled);
  const [open, setOpen] = useState(settingsOpen ?? false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setNotice(null);
    try {
      const body = await api<{ enabled: boolean }>(`/api/plugins/${plugin.id}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled(body.enabled);
    } catch {
      setNotice("啟用狀態沒有更新。");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="ts-box is-raised">
      <div className="ts-content is-padded s4n-stack">
        <div className="s4n-split">
          <h2 className="ts-header is-large">{plugin.name}</h2>
          <code className="ts-text is-code">{plugin.id}</code>
        </div>
        <p className="ts-text is-description">{plugin.description ?? "沒有說明。"}</p>
        <div className="ts-wrap is-middle-aligned">
          {plugin.kind.map((kind) => (
            <span key={kind} className={kind === "payment" ? "ts-badge is-accent" : "ts-badge is-secondary"}>
              {kindLabel[kind] ?? kind}
            </span>
          ))}
          <span className="ts-badge is-outlined">{enabled ? "啟用中" : "已停用"}</span>
          {plugin.official ? <span className="ts-badge is-outlined">官方</span> : null}
        </div>
        <div className="s4n-choices">
          <button
            type="button"
            className={buttonClass({
              tone: enabled ? "neutral" : "accent",
              variant: enabled ? "outlined" : "solid",
              icon: "start",
              loading: pending,
            })}
            disabled={pending}
            onClick={() => void toggle()}
            aria-pressed={enabled}
          >
            <span className={enabled ? "ts-icon is-pause-icon" : "ts-icon is-play-icon"} aria-hidden="true" />
            {pending ? "更新中…" : enabled ? "停用" : "啟用"}
          </button>
          {plugin.settingsFields.length > 0 ? (
            <button
              type="button"
              className={buttonClass({ variant: "outlined", icon: "start" })}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="ts-icon is-gear-icon" aria-hidden="true" />
              {open ? "隱藏設定" : "設定"}
            </button>
          ) : null}
        </div>
        {plugin.kind.includes("payment") ? (
          <p className="ts-text is-description">啟用且必填欄位都設定之後，才會出現在贊助頁。密文只顯示已設定或尚未設定。</p>
        ) : null}
        {notice ? <Note tone="danger">{notice}</Note> : null}
      </div>
      {open ? (
        <div className="ts-content is-tertiary is-padded s4n-stack">
          <div className="ts-divider" />
          <SettingsForm pluginId={plugin.id} />
          <div>
            <h3 className="ts-header">權限</h3>
            <ul className="ts-list">
              {plugin.permissions.map((permission) => (
                <li key={permission} className="item">
                  <code className="ts-text is-code">{permission}</code>
                  <span className="ts-text is-description">{permissionLabel[permission] ? ` ${permissionLabel[permission]}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SettingsForm({ pluginId }: { pluginId: string }) {
  const [fields, setFields] = useState<SettingsFieldState[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ fields: SettingsFieldState[] }>(`/api/plugins/${pluginId}/settings`, { signal: controller.signal })
      .then((body) => {
        setFields(body.fields);
        const next: Record<string, string> = {};
        for (const field of body.fields) {
          if (field.secret) continue;
          next[field.key] = draftValue(field);
        }
        setDrafts(next);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("設定沒有載入。");
      });
    return () => controller.abort();
  }, [pluginId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fields === null) return;
    setPending(true);
    setSaved(false);
    setError(null);
    const values: Record<string, string | number | boolean> = {};
    for (const field of fields) {
      const raw = drafts[field.key] ?? "";
      if (field.secret) {
        if (raw.trim() !== "") values[field.key] = raw;
        continue;
      }
      if (field.type === "integer" || field.type === "number") {
        if (raw.trim() === "") continue;
        values[field.key] = Number(raw);
        continue;
      }
      if (field.type === "boolean") {
        values[field.key] = raw === "true";
        continue;
      }
      if (raw !== "" || field.value !== undefined) values[field.key] = raw;
    }
    try {
      const body = await api<{ fields: SettingsFieldState[] }>(`/api/plugins/${pluginId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
      setFields(body.fields);
      setDrafts((current) => {
        const next = { ...current };
        for (const field of body.fields) {
          if (field.secret) next[field.key] = "";
        }
        return next;
      });
      setSaved(true);
    } catch (caught) {
      setError(settingsError(caught));
    } finally {
      setPending(false);
    }
  }

  if (error !== null && fields === null) return <Note tone="danger">{error}</Note>;
  if (fields === null) return <p className="ts-text is-description">正在讀取設定…</p>;

  return (
    <form onSubmit={onSubmit} className="s4n-fields">
      {fields.map((field) => (
        <Field
          key={field.key}
          id={`${pluginId}-${field.key}`}
          label={field.title ?? field.key}
          extra={
            <>
              {field.secret ? <span className="ts-badge is-outlined">{field.configured ? "已設定" : "未設定"}</span> : null}
              {field.required ? <span className="ts-text is-description is-small">必填</span> : null}
            </>
          }
          hint={
            <>
              {field.secret ? <Hint>只會存成密文。這個畫面不會再顯示內容。</Hint> : null}
              {field.description ? <Hint>{field.description}</Hint> : null}
            </>
          }
        >
          {field.enum !== null ? (
            <div className="ts-select is-fluid">
              <select
                id={`${pluginId}-${field.key}`}
                value={drafts[field.key] ?? ""}
                onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
              >
                <option value="">請選擇</option>
                {field.enum.map((option) => (
                  <option key={option} value={option}>
                    {enumLabel[option] ?? option}
                  </option>
                ))}
              </select>
            </div>
          ) : field.type === "boolean" ? (
            <div className="ts-switch">
              <input
                id={`${pluginId}-${field.key}`}
                type="checkbox"
                checked={(drafts[field.key] ?? "false") === "true"}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [field.key]: event.target.checked ? "true" : "false" }))
                }
              />
              <label htmlFor={`${pluginId}-${field.key}`}>{(drafts[field.key] ?? "false") === "true" ? "開啟" : "關閉"}</label>
            </div>
          ) : field.multiline ? (
            <TextArea
              id={`${pluginId}-${field.key}`}
              rows={5}
              value={drafts[field.key] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          ) : (
            <TextInput
              id={`${pluginId}-${field.key}`}
              type={field.secret ? "password" : field.type === "integer" || field.type === "number" ? "number" : "text"}
              min={field.minimum ?? undefined}
              step={field.type === "integer" ? 1 : undefined}
              autoComplete={field.secret ? "off" : undefined}
              placeholder={field.secret ? (field.configured ? "已設定，留空表示不變更" : "未設定") : undefined}
              value={drafts[field.key] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          )}
        </Field>
      ))}
      <div className="s4n-choices">
        <button type="submit" className={buttonClass({ tone: "accent", icon: "start", loading: pending })} disabled={pending}>
          <span className="ts-icon is-check-icon" aria-hidden="true" />
          {pending ? "儲存中…" : "儲存設定"}
        </button>
        {saved ? <p className="ts-text">已儲存。密文不會再顯示。</p> : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </div>
    </form>
  );
}

function draftValue(field: SettingsFieldState): string {
  if (field.value !== undefined) return String(field.value);
  if (field.default !== undefined && field.default !== null) return String(field.default);
  if (field.type === "boolean") return "false";
  return "";
}

function settingsError(error: unknown): string {
  if (!(error instanceof ApiError)) return "設定沒有儲存。";
  if (error.status === 422) return "還有欄位不完整，或格式不對。";
  if (error.status === 403) return "這個來源不被允許。";
  return "設定沒有儲存。";
}
