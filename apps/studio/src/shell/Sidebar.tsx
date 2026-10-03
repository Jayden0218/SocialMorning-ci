// The Studio side menu listing each section, marking unbuilt ones "Soon".
import { NavLink, useNavigate } from 'react-router';
import type { Show } from '../api';
import { useSession } from '../session';
import { IconChart, IconCoin, IconComments, IconEpisodes, IconHome, IconMedia, IconMegaphone, IconPeople, IconPoll, IconSettings, IconShield } from './Icons';
import { useUnsaved } from './Unsaved';

/**
 * The nine jobs, in the order a creator reaches for them. Sections not built yet are shown
 * as such ("Soon") rather than linking to an empty page — a placeholder is not a feature.
 */
export const SECTIONS = [
  { path: 'home', label: 'Home', icon: IconHome, built: true },
  { path: 'data', label: 'Data', icon: IconChart, built: true },
  { path: 'episodes', label: 'Episodes', icon: IconEpisodes, built: true },
  { path: 'media', label: 'Media', icon: IconMedia, built: true, hostedOnly: true },
  { path: 'comments', label: 'Comments', icon: IconComments, built: true },
  { path: 'subscribers', label: 'Subscribers', icon: IconPeople, built: true },
  { path: 'announcements', label: 'Announcements', icon: IconMegaphone, built: true },
  { path: 'polls', label: 'Polls', icon: IconPoll, built: true },
  { path: 'tips', label: 'Tips', icon: IconCoin, built: true, ownerOnly: true },
  { path: 'settings', label: 'Settings', icon: IconSettings, built: true, ownerOnly: true },
] as const;

export function Sidebar({ show, open, onNavigate }: { show: Show; open: boolean; onNavigate: () => void }) {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const { guard } = useUnsaved();
  const shows = session.state === 'in' ? session.shows : [show];
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Studio">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span>SocialMorning Studio</div>
      <div>
        <div className="show-card">
          {show.image ? <img className="show-art" src={show.image} alt="" /> : <div className="show-art" aria-hidden="true" />}
          <div>
            <div className="show-name">{show.title ?? 'Your show'}</div>
            <div className="show-role">{show.role === 'owner' ? 'Owner' : 'Operator'}</div>
          </div>
        </div>
        {shows.length > 1 ? (
          <div className="switcher">
            <label className="sr-only" htmlFor="show-switch">Switch show</label>
            <select id="show-switch" value={show.key} onChange={(e) => { navigate(`/s/${e.target.value}/home`); onNavigate(); }}>
              {shows.map((s) => <option key={s.key} value={s.key}>{(s.title ?? s.feedUrl) + (s.role === 'owner' ? '' : ' · operator')}</option>)}
            </select>
          </div>
        ) : null}
      </div>
      <nav className="nav" aria-label="Sections">
        {SECTIONS.filter((s) => (!('ownerOnly' in s) || show.role === 'owner') && (!('hostedOnly' in s) || show.hosted)).map((s) =>
          s.built ? (
            <NavLink key={s.path} to={`/s/${show.key}/${s.path}`} end={false} onClick={(e) => { guard(`/s/${show.key}/${s.path}`)(e); onNavigate(); }}>
              <s.icon />{s.label}
            </NavLink>
          ) : (
            <span key={s.path} className="nav-off">
              <s.icon />{s.label}<span className="soon">Soon<span className="sr-only"> — not built yet</span></span>
            </span>
          ),
        )}
      </nav>
      {/* M15 T005: shown only when the server says this account is admin (display only; every admin route checks for itself). */}
      {session.state === 'in' && session.isAdmin ? (
        <nav className="nav" aria-label="Admin">
          <NavLink to="/admin" onClick={(e) => { guard('/admin')(e); onNavigate(); }}><IconShield />Admin</NavLink>
        </nav>
      ) : null}
      <div className="sidebar-foot">
        {session.state === 'in' ? <span className="muted">{session.me.displayName}</span> : null}
        <button type="button" className="linkish" onClick={() => { void signOut(); }}>Sign out</button>
      </div>
    </aside>
  );
}
