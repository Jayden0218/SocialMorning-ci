// The Admin section's frame: its side menu, banner and sign-in-again rule.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { reauthPath, whenReauth } from '../../api';
import { useSession } from '../../session';
import { ActingBanner } from '../../shell/ActingBanner';
import { IconMenu } from '../../shell/Icons';
import { Empty } from '../../shell/States';
import { UnsavedProvider, useUnsaved } from '../../shell/Unsaved';

/** M15 T005 — the admin sub-nav, in the order the owner works through it. */
export const ADMIN_SECTIONS = [
  { path: 'dashboard', label: 'Dashboard' },
  { path: 'activity', label: 'Activity' },
  { path: 'picks', label: 'Picks' },
  { path: 'curated', label: 'Curated' },
  { path: 'discover', label: 'Discover' },
  { path: 'launch', label: 'Launch' },
  { path: 'accounts', label: 'Accounts' },
  { path: 'users', label: 'Users' },
  { path: 'reports', label: 'Reports' },
  // M22 US13: the shows offered translated transcripts, and today's Groq use.
  { path: 'translation', label: 'Translation' },
  { path: 'redeem', label: 'Redeem codes' }, // M24 lane A3
] as const;

/**
 * Admin's frame: its own sidebar (no show is needed), the acting banner, and the 12-hour rule —
 * a `reauth` answer from any admin call sends the owner to sign in again and back here (T010).
 * Whether this account may see Admin is the server's decision (FR-001); this only draws.
 */
export function AdminLayout() {
  return <UnsavedProvider><AdminFrame /></UnsavedProvider>;
}

function AdminFrame() {
  const { session, signOut } = useSession();
  const { guard } = useUnsaved();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    whenReauth(() => navigate(reauthPath(loc.pathname), { replace: true }));
    return () => whenReauth(null);
  }, [navigate, loc.pathname]);
  if (session.state !== 'in') return null;
  const first = session.shows[0];
  return (
      <div className="layout">
        <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Admin">
          <div className="brand"><span className="brand-mark" aria-hidden="true">S</span>SocialMorning Admin</div>
          <nav className="nav" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((s) => (
              <NavLink key={s.path} to={`/admin/${s.path}`} onClick={(e) => { guard(`/admin/${s.path}`)(e); setOpen(false); }}>{s.label}</NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            {first ? <Link to={`/s/${first.key}/home`}>Back to your shows</Link> : <Link to="/no-show">Back to the Studio</Link>}
            <span className="muted">{session.me.displayName}</span>
            <button type="button" className="linkish" onClick={() => { void signOut(); }}>Sign out</button>
          </div>
        </aside>
        <main className="main" id="main">
          <button type="button" className="menu-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <IconMenu />Menu
          </button>
          <ActingBanner />
          {session.isAdmin ? <Outlet /> : (
            <Empty title="Admin is for the owner only">
              <p>This account cannot open Admin. <Link to="/">Back to the Studio</Link></p>
            </Empty>
          )}
        </main>
      </div>
  );
}
