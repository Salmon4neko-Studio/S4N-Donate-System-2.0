import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";

const links = [
  { to: "/", label: "概況", end: true },
  { to: "/donations", label: "帳本", end: false },
  { to: "/plugins", label: "外掛", end: false },
  { to: "/overlay", label: "疊層", end: false },
  { to: "/donate", label: "贊助頁", end: false },
];

export function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const email = auth.snapshot.status === "ready" ? auth.snapshot.email : "";

  return (
    <div className="mx-auto grid min-h-svh max-w-6xl gap-8 px-5 py-6 md:grid-cols-[13.5rem_minmax(0,1fr)] md:px-8 md:py-10">
      <header className="flex flex-col gap-6 md:sticky md:top-8 md:self-start">
        <Link to="/" className="block">
          <span className="font-serif text-[1.75rem] leading-none text-ink">S4N</span>
          <span className="mt-2 block text-sm text-ink-soft">捐款系統 2.0</span>
        </Link>
        <nav className="flex flex-wrap gap-2 md:flex-col" aria-label="主要">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                [
                  "rounded-full px-3 py-1.5 text-sm transition-colors duration-200",
                  isActive ? "bg-cinnabar-soft text-cinnabar" : "text-ink-soft hover:text-ink",
                ].join(" ")
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col items-start gap-2">
          {email ? <p className="max-w-full truncate text-xs text-ink-soft">{email}</p> : null}
          <button
            type="button"
            className="text-sm text-indigo underline-offset-4 hover:underline"
            onClick={() => {
              void auth.logout().then(() => navigate("/login"));
            }}
          >
            登出
          </button>
        </div>
        <p className="max-w-xs text-xs leading-5 text-ink-soft md:max-w-none">
          已開放的付款方式會送到綠界或歐付寶。測試贊助只給疊層預覽。
        </p>
      </header>
      <main className="s4n-rise min-w-0 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
