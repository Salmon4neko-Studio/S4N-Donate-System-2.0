import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type PluginSummary } from "@/lib/api";

type Status = "loading" | "ready" | "error";

interface PluginNavState {
  status: Status;
  plugins: PluginSummary[];
  reload: () => Promise<void>;
}

const PluginNavContext = createContext<PluginNavState | null>(null);

export function PluginNavProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);

  const reload = useCallback((signal?: AbortSignal) => {
    return api<{ plugins: PluginSummary[] }>("/api/plugins", signal ? { signal } : undefined)
      .then((body) => {
        setPlugins(body.plugins);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus((current) => (current === "ready" ? "ready" : "error"));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const value = useMemo(
    () => ({
      status,
      plugins,
      reload: () => reload(),
    }),
    [plugins, reload, status],
  );

  return <PluginNavContext.Provider value={value}>{children}</PluginNavContext.Provider>;
}

export function usePluginNav(): PluginNavState {
  const value = useContext(PluginNavContext);
  if (value === null) throw new Error("plugin nav is missing");
  return value;
}

/** Enabled plugins that have ordinary settings or an overlay. */
export function pluginSettingsNavItems(plugins: readonly PluginSummary[]): PluginSummary[] {
  return plugins.filter((plugin) => plugin.enabled && plugin.settingsNav);
}
