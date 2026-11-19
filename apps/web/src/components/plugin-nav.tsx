import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { pluginSettingsNavItems, usePluginNav } from "@/lib/plugin-nav";

export function PluginNavGroup() {
  const location = useLocation();
  const nav = usePluginNav();
  const onPluginRoute = location.pathname === "/plugins" || /^\/plugins\/[^/]+\/settings\/?$/.test(location.pathname);
  const [open, setOpen] = useState(onPluginRoute);
  const items = pluginSettingsNavItems(nav.plugins);
  const parentActive = location.pathname === "/plugins";

  useEffect(() => {
    if (onPluginRoute) setOpen(true);
  }, [onPluginRoute]);

  return (
    <div className="s4n-nav-group">
      <div className={parentActive ? "item is-active s4n-nav-row" : "item s4n-nav-row"}>
        <NavLink to="/plugins" end className="s4n-nav-link">
          <span className="ts-icon is-puzzle-piece-icon" aria-hidden="true" />
          外掛
        </NavLink>
        <button
          type="button"
          className="s4n-nav-caret"
          aria-expanded={open}
          aria-controls="s4n-plugin-nav"
          aria-label={open ? "收合外掛" : "展開外掛"}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={open ? "ts-icon is-angle-up-icon" : "ts-icon is-angle-down-icon"} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div id="s4n-plugin-nav" className="s4n-nav-sub">
          {items.length === 0 ? (
            <p className="ts-text is-description is-small s4n-nav-empty">啟用有一般設定的外掛後會列在這裡。</p>
          ) : (
            items.map((plugin) => (
              <NavLink
                key={plugin.id}
                to={`/plugins/${encodeURIComponent(plugin.id)}/settings`}
                className={({ isActive }) => (isActive ? "item is-active" : "item")}
              >
                {plugin.name}
              </NavLink>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
