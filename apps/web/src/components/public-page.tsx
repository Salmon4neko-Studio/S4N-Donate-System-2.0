import type { ReactNode } from "react";
import { Link } from "react-router";

export function PublicPage({
  kicker,
  title,
  lede,
  link,
  children,
}: {
  kicker: string;
  title?: string;
  lede?: string;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="s4n-public">
      <div className="ts-container is-very-narrow">
        {link ? (
          <Link className="ts-text is-link s4n-public-link" to={link.to}>
            {link.label}
          </Link>
        ) : null}
        <article className="ts-box is-raised s4n-sheet s4n-rise">
          <div className="ts-content is-padded">
            <p className="s4n-kicker">{kicker}</p>
            {title ? <h1 className="ts-header is-huge">{title}</h1> : null}
            {lede ? <p className="ts-text is-description s4n-lede">{lede}</p> : null}
            <div className="s4n-sheet-body">{children}</div>
          </div>
        </article>
      </div>
    </main>
  );
}

export function PendingLine({ children }: { children: ReactNode }) {
  return (
    <main className="s4n-public">
      <div className="ts-container is-very-narrow">
        <div className="ts-text is-description">{children}</div>
      </div>
    </main>
  );
}
