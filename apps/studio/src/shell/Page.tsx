import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

/** A page's title, its one-line purpose, an optional action, and sub-tabs as real links. */
export function PageHead({ title, sub, action, tabs }: { title: string; sub?: string; action?: ReactNode; tabs?: { to: string; label: string; end?: boolean }[] }) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {sub ? <p>{sub}</p> : null}
        </div>
        {action}
      </header>
      {tabs ? (
        <nav className="subtabs" aria-label={`${title} sections`}>
          {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end ?? true}>{t.label}</NavLink>)}
        </nav>
      ) : null}
    </>
  );
}
