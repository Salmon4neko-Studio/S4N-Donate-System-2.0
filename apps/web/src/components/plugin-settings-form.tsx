import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { buttonClass, Field, Hint, Note, TextArea, TextInput } from "@/components/fields";
import { ApiError, api, type PluginSettingsResponse, type SettingsFieldState } from "@/lib/api";

const enumLabel: Record<string, string> = {
  stage: "測試站",
  production: "正式站",
  slow: "慢",
  medium: "中",
};

export function PluginSettingsForm({
  pluginId,
  scope,
}: {
  pluginId: string;
  scope: "secret" | "public";
}) {
  const [fields, setFields] = useState<SettingsFieldState[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<PluginSettingsResponse>(`/api/plugins/${pluginId}/settings`, { signal: controller.signal })
      .then((body) => {
        const visible = scope === "secret" ? body.secretFields : body.publicFields;
        setFields(visible);
        const next: Record<string, string> = {};
        for (const field of visible) {
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
  }, [pluginId, scope]);

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
      const body = await api<PluginSettingsResponse>(`/api/plugins/${pluginId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
      const visible = scope === "secret" ? body.secretFields : body.publicFields;
      setFields(visible);
      setDrafts((current) => {
        const next = { ...current };
        for (const field of visible) {
          if (field.secret) next[field.key] = "";
          else next[field.key] = draftValue(field);
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
  if (fields.length === 0) {
    if (scope === "secret") return null;
    return (
      <p className="ts-text is-description">
        這個外掛沒有一般設定。
        <Link to="/plugins" className="ts-text is-link">
          回到外掛
        </Link>
      </p>
    );
  }

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
            field.secret ? (
              <Hint>{secretHint(field.description)}</Hint>
            ) : field.description ? (
              <Hint>{field.description}</Hint>
            ) : null
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
        {saved ? <p className="ts-text">{scope === "secret" ? "已儲存。密文不會再顯示。" : "已儲存。"}</p> : null}
        {error ? <Note tone="danger">{error}</Note> : null}
      </div>
    </form>
  );
}

function secretHint(description: string | null): string {
  const status = "畫面只顯示已設定或未設定";
  const text = description?.trim().replace(/[。．\s]+$/u, "") ?? "";
  if (text === "") return `只會存成密文，${status}。`;
  if (text.includes("已設定") || text.includes("未設定")) return `${text}。`;
  if (text.endsWith("只會存成密文")) return `${text}，${status}。`;
  return `${text}。只會存成密文，${status}。`;
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
