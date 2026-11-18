import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { buttonClass } from "@/components/fields";
import { ThemeButton, useDashboardTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";

const links = [
  { to: "/", label: "概況", end: true, icon: "house" },
  { to: "/donations", label: "帳本", end: false, icon: "receipt" },
  { to: "/plugins", label: "外掛", end: false, icon: "puzzle-piece" },
  { to: "/overlay", label: "疊層", end: false, icon: "display" },
  { to: "/donate", label: "贊助頁", end: false, icon: "heart" },
];

export function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const theme = useDashboardTheme();
  const email = auth.snapshot.status === "ready" ? auth.snapshot.email : "";

  return (
    <div className={theme.dark ? "s4n-dashboard ts-app-layout is-horizontal has-dark" : "s4n-dashboard ts-app-layout is-horizontal"}>
      <header className="cell s4n-side">
        <Link to="/" className="s4n-brand">
          <span className="s4n-seal" aria-hidden="true">
            S
          </span>
          <span>
            <span className="ts-header is-big">S4N</span>
            <span className="ts-text is-description is-small">捐款系統 2.0</span>
          </span>
        </Link>
        <nav className="ts-app-sidebar is-accent" aria-label="主要">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? "item is-active" : "item")}
            >
              <span className={`ts-icon is-${link.icon}-icon`} aria-hidden="true" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="s4n-side-foot">
          {email ? <p className="ts-text is-small is-description is-truncated">{email}</p> : null}
          <ThemeButton dark={theme.dark} onToggle={theme.toggle} />
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "small", icon: "start" })}
            onClick={() => {
              void auth.logout().then(() => navigate("/login"));
            }}
          >
            <span className="ts-icon is-right-from-bracket-icon" aria-hidden="true" />
            登出
          </button>
          <p className="ts-text is-description is-small s4n-side-note">
            已開放的付款方式會送到綠界或歐付寶。測試贊助只給疊層預覽。
          </p>
        </div>
      </header>
      <main className="cell is-fluid s4n-main">
        <div className="ts-container is-padded s4n-rise">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
