import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <Card className="rounded-card border-line bg-paper-raised shadow-soft">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle className="font-serif text-2xl font-medium">{plugin.name}</CardTitle>
          <code className="text-xs text-ink-soft">{plugin.id}</code>
        </div>
        <CardDescription className="text-sm leading-6">{plugin.description ?? "沒有說明。"}</CardDescription>
        <div className="flex flex-wrap gap-2">
          {plugin.kind.map((kind) => (
            <Badge key={kind} variant={kind === "payment" ? "default" : "secondary"}>
              {kindLabel[kind] ?? kind}
            </Badge>
          ))}
          <Badge variant="outline">{enabled ? "啟用中" : "已停用"}</Badge>
          {plugin.official ? <Badge variant="outline">官方</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={enabled ? "outline" : "default"} className="h-9 px-3" disabled={pending} onClick={() => void toggle()} aria-pressed={enabled}>
            {pending ? "更新中…" : enabled ? "停用" : "啟用"}
          </Button>
          {plugin.settingsFields.length > 0 ? (
            <Button type="button" variant="outline" className="h-9 px-3" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? "隱藏設定" : "設定"}
            </Button>
          ) : null}
        </div>
        {notice ? <p className="text-sm text-cinnabar">{notice}</p> : null}
      </CardHeader>
      {open ? (
        <CardContent className="grid gap-6">
          <SettingsForm pluginId={plugin.id} />
          <div>
            <h2 className="text-sm text-ink">權限</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
              {plugin.permissions.map((permission) => (
                <li key={permission}>
                  <code className="text-ink">{permission}</code>
                  <span className="ml-2">{permissionLabel[permission] ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      ) : null}
    </Card>
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
          next[field.key] = field.value === undefined ? "" : String(field.value);
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

  if (error !== null && fields === null) return <p className="text-sm text-cinnabar">{error}</p>;
  if (fields === null) return <p className="text-sm text-ink-soft">正在讀取設定…</p>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={`${pluginId}-${field.key}`}>{field.title ?? field.key}</Label>
            {field.secret ? <Badge variant="outline">{field.configured ? "已設定" : "尚未設定"}</Badge> : null}
            {field.required ? <span className="text-xs text-ink-soft">必填</span> : null}
          </div>
          {field.enum !== null ? (
            <select
              id={`${pluginId}-${field.key}`}
              className="h-10 rounded-lg border border-input bg-paper px-3 text-sm"
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
          ) : (
            <Input
              id={`${pluginId}-${field.key}`}
              type={field.secret ? "password" : field.type === "integer" || field.type === "number" ? "number" : "text"}
              min={field.minimum ?? undefined}
              step={field.type === "integer" ? 1 : undefined}
              autoComplete={field.secret ? "off" : undefined}
              placeholder={field.secret ? (field.configured ? "已設定，留空表示不變更" : "尚未設定") : undefined}
              value={drafts[field.key] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
              className="h-10"
            />
          )}
          {field.secret ? (
            <p className="text-xs leading-5 text-ink-soft">只會存成密文。這個畫面不會再顯示內容。</p>
          ) : null}
          {field.description ? <p className="text-xs leading-5 text-ink-soft">{field.description}</p> : null}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending ? "儲存中…" : "儲存設定"}
        </Button>
        {saved ? <p className="text-sm text-ink">已儲存。密文不會再顯示。</p> : null}
        {error ? <p className="text-sm text-cinnabar">{error}</p> : null}
      </div>
    </form>
  );
}

function settingsError(error: unknown): string {
  if (!(error instanceof ApiError)) return "設定沒有儲存。";
  if (error.status === 422) return "還有欄位不完整，或格式不對。";
  if (error.status === 403) return "這個來源不被允許。";
  return "設定沒有儲存。";
}
