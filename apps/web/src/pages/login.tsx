import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AuthFrame } from "@/components/auth-frame";
import { buttonClass, Field, Note, TextInput } from "@/components/fields";
import { PendingLine } from "@/components/public-page";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (auth.snapshot.status === "loading") return <PendingLine>正在確認工作階段…</PendingLine>;
  if (auth.snapshot.status === "ready") return <Navigate to="/" replace />;
  if (auth.snapshot.status === "anonymous" && auth.snapshot.needsSetup) return <Navigate to="/setup" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await auth.refresh();
      navigate("/");
    } catch (caught) {
      setError(loginError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      kicker="登入"
      title="回到工作台"
      lede="工作階段存在伺服器的 Cookie 裡，瀏覽器讀不到內容。連續失敗太多次會先被擋下。"
    >
      {auth.snapshot.status === "unavailable" ? (
        <Note tone="danger">核心 API 沒有回應。請確認 API 與資料庫都已啟動。</Note>
      ) : (
        <form onSubmit={onSubmit} className="s4n-fields">
          <Field id="login-email" label="電子郵件">
            <TextInput
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field id="login-password" label="密碼">
            <TextInput
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {error ? <Note tone="danger">{error}</Note> : null}
          <button type="submit" className={buttonClass({ tone: "accent", size: "large", fluid: true, loading: pending, icon: "start" })} disabled={pending}>
            <span className="ts-icon is-right-to-bracket-icon" aria-hidden="true" />
            {pending ? "登入中…" : "登入"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}

function loginError(error: unknown): string {
  if (!(error instanceof ApiError)) return "無法連上核心 API。";
  if (error.status === 401) return "電子郵件或密碼不正確。";
  if (error.status === 429) return "嘗試太多次，請稍後再試。";
  if (error.status === 422) return "請檢查電子郵件，密碼至少要 12 個字元。";
  return "登入沒有成功。";
}
