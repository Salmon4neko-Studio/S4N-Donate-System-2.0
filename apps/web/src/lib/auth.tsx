import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "./api";

export type AuthSnapshot =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "anonymous"; needsSetup: boolean }
  | { status: "ready"; email: string };

interface AuthContextValue {
  snapshot: AuthSnapshot;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ status: "loading" });

  const refresh = useCallback(async () => {
    setSnapshot(await loadAuth());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAuth().then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // The local view still returns to the login screen.
    }
    setSnapshot(await loadAuth());
  }, []);

  const value = useMemo(() => ({ snapshot, refresh, logout }), [snapshot, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("AuthProvider missing");
  return value;
}

async function loadAuth(): Promise<AuthSnapshot> {
  let needsSetup = false;
  try {
    const status = await api<{ needsSetup: boolean }>("/api/auth/status");
    needsSetup = status.needsSetup;
  } catch {
    return { status: "unavailable" };
  }
  try {
    const me = await api<{ email: string }>("/api/auth/me");
    return { status: "ready", email: me.email };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: "anonymous", needsSetup };
    }
    return { status: "unavailable" };
  }
}
