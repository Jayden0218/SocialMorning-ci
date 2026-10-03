// A page header with title, short purpose, an action and sub-tabs.
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useUnsaved } from './Unsaved';

/** A page's title, its one-line purpose, an optional action, and sub-tabs as real links. */
export function PageHead({ title, sub, action, tabs }: { title: string; sub?: string; action?: ReactNode; tabs?: { to: string; label: string; end?: boolean }[] }) {
  const { guard } = useUnsaved();
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
          {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end ?? true} onClick={guard(t.to)}>{t.label}</NavLink>)}
        </nav>
      ) : null}
    </>
  );
}
