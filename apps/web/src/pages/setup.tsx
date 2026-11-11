import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  if (auth.snapshot.status === "loading") return <p className="px-5 py-10 text-sm text-ink-soft">正在確認工作階段…</p>;
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
        <p className="text-sm leading-6 text-cinnabar" role="status">
          核心 API 沒有回應。登入需要 PostgreSQL，請先啟動資料庫再執行遷移。
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-email">電子郵件</Label>
            <Input
              id="setup-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-password">密碼</Label>
            <Input
              id="setup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10"
            />
            <p className="text-xs leading-5 text-ink-soft">至少 12 個字元。</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-confirm">再輸入一次密碼</Label>
            <Input
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-sm leading-6 text-cinnabar" role="status">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 px-5" disabled={pending}>
            {pending ? "建立中…" : "建立並進入工作台"}
          </Button>
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
