import type { ReactNode } from "react";
import { Link } from "react-router";

export function AuthFrame({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col px-5 py-10 md:py-16">
      <Link to="/donate" className="text-sm text-indigo underline-offset-4 hover:underline">
        贊助頁
      </Link>
      <p className="mt-10 text-xs tracking-[0.18em] text-cinnabar">{kicker}</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">{title}</h1>
      <p className="mt-4 text-base leading-7 text-ink-soft">{lede}</p>
      <div className="s4n-rise mt-8">{children}</div>
    </div>
  );
}
