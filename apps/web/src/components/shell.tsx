import { Link, NavLink, Outlet } from "react-router";

const links = [
  { to: "/", label: "概況", end: true },
  { to: "/plugins", label: "外掛", end: false },
  { to: "/donate", label: "贊助頁", end: false },
];

export function Shell() {
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
        <p className="max-w-xs text-xs leading-5 text-ink-soft md:max-w-none">
          骨架。金流、聊天與提醒都還沒有接上。
        </p>
      </header>
      <main className="s4n-rise min-w-0 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
