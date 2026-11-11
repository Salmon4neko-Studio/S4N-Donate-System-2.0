import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AuthFrame } from "@/components/auth-frame";
import { buttonClass, Field, Hint, Note, TextInput } from "@/components/fields";
import { PendingLine } from "@/components/public-page";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function SetupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (auth.snapshot.status === "loading") return <PendingLine>正在確認工作階段…</PendingLine>;
  if (auth.snapshot.status === "ready") return <Navigate to="/" replace />;
  if (auth.snapshot.status === "anonymous" && !auth.snapshot.needsSetup) return <Navigate to="/login" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError("兩次密碼不相同。");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await auth.refresh();
      navigate("/");
    } catch (caught) {
      setError(setupError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      kicker="初次設定"
      title="建立第一位營運者"
      lede="這個動作只在還沒有任何營運者時可用，而且只會成功一次。密碼以 Argon2id 存成雜湊，工作階段留在伺服器。"
    >
      {auth.snapshot.status === "unavailable" ? (
        <Note tone="danger">核心 API 沒有回應。登入需要 PostgreSQL，請先啟動資料庫再執行遷移。</Note>
      ) : (
        <form onSubmit={onSubmit} className="s4n-fields">
          <Field id="setup-email" label="電子郵件">
            <TextInput
              id="setup-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field id="setup-password" label="密碼" hint={<Hint>至少 12 個字元。</Hint>}>
            <TextInput
              id="setup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field id="setup-confirm" label="再輸入一次密碼">
            <TextInput
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          {error ? <Note tone="danger">{error}</Note> : null}
          <button type="submit" className={buttonClass({ tone: "accent", size: "large", fluid: true, loading: pending, icon: "start" })} disabled={pending}>
            <span className="ts-icon is-user-icon" aria-hidden="true" />
            {pending ? "建立中…" : "建立並進入工作台"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}

function setupError(error: unknown): string {
  if (!(error instanceof ApiError)) return "無法連上核心 API。";
  if (error.status === 409) return "已經有營運者了，請改為登入。";
  if (error.status === 422) return "請檢查電子郵件，密碼至少要 12 個字元。";
  if (error.status === 429) return "嘗試太多次，請稍後再試。";
  if (error.status === 503) return "資料庫還沒有準備好，無法建立營運者。";
  return "建立沒有成功。";
}
