import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (auth.snapshot.status === "loading") return <p className="px-5 py-10 text-sm text-ink-soft">正在確認工作階段…</p>;
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
        <p className="text-sm leading-6 text-cinnabar" role="status">
          核心 API 沒有回應。請確認 API 與資料庫都已啟動。
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-email">電子郵件</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">密碼</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-sm leading-6 text-cinnabar" role="status">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 px-5" disabled={pending}>
            {pending ? "登入中…" : "登入"}
          </Button>
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
