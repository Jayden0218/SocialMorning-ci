import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { useSession } from '../session';
import { shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import { light } from '../tokens';

type Overrides = { title: string | null; description: string | null; coverUrl: string | null; themeColour: string | null; milestoneMessage: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null };

/** US6 — how the show appears, who helps, and giving it back (FR-024..FR-026). Owner only. */
export function Settings({ show }: { show: Show }) {
  const tab = useLocation().pathname.split('/').at(-1);
  const base = `/s/${show.key}/settings`;
  if (show.role !== 'owner') {
    return <><PageHead title="Settings" /><div className="card"><Empty title="Only the owner can do this">Ask the show's owner to change these.</Empty></div></>;
  }
  return (
    <>
      <PageHead title="Settings" tabs={[{ to: base, label: 'How it appears' }, { to: `${base}/team`, label: 'Team' }, { to: `${base}/more`, label: 'More' }]} />
      {tab === 'team' ? <Team show={show} /> : tab === 'more' ? <More show={show} /> : <Appearance show={show} />}
    </>
  );
}

function Appearance({ show }: { show: Show }) {
  const o = useLoad(() => api<{ overrides: Overrides | null }>(`/v1/studio/shows/${show.key}/overrides`), [show.key]);
  const [f, setF] = useState({ title: '', description: '', coverUrl: '', themeColour: '', milestoneMessage: '', hosts: '', links: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (o.state !== 'ready') return;
    const v = o.data.overrides;
    setF({
      title: v?.title ?? '', description: v?.description ?? '', coverUrl: v?.coverUrl ?? '', themeColour: v?.themeColour ?? '',
      milestoneMessage: v?.milestoneMessage ?? '', hosts: (v?.hosts ?? []).join(', '), links: (v?.links ?? []).map((l) => `${l.label} ${l.url}`).join('\n'),
    });
  }, [o.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (o.state === 'loading') return <Loading lines={6} />;
  if (o.state === 'error') return <div className="card"><Failed message={o.message} retry={o.retry} /></div>;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setMsg(null);
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const hosts = f.hosts.split(',').map((h) => h.trim()).filter(Boolean);
    const links = f.links.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(' '); return { label: l.slice(0, i).trim(), url: l.slice(i + 1).trim() }; });
    try {
      await api(`/v1/studio/shows/${show.key}/overrides`, { method: 'PUT', body: {
        title: orNull(f.title), description: orNull(f.description), coverUrl: orNull(f.coverUrl), themeColour: orNull(f.themeColour),
        milestoneMessage: orNull(f.milestoneMessage), hosts: hosts.length ? hosts : null, links: links.length ? links : null,
      } });
      setMsg({ ok: true, text: 'Saved. The app shows it the next time the show page opens.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof f, label: string, hint: string, el: 'input' | 'textarea' = 'input', extra: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={`o-${k}`}>{label}</label>
      {el === 'input'
        ? <input id={`o-${k}`} value={f[k]} onChange={set(k)} {...extra} />
        : <textarea id={`o-${k}`} className="textarea" rows={4} value={f[k]} onChange={set(k)} {...extra} />}
      <span className="muted" style={{ fontSize: 13 }}>{hint}</span>
    </div>
  );
  return (
    <section className="card">
      <p className="muted" style={{ marginTop: 0 }}>Leave a field empty to use what your feed says. Your feed stays the source of everything else.</p>
      {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {field('title', 'Show name', `From your feed: ${show.title ?? '—'}`, 'input', { maxLength: 100 })}
        {field('description', 'Description', 'Up to 4,000 characters.', 'textarea', { maxLength: 4000 })}
        {field('coverUrl', 'Cover image link', 'An https:// link to a square image.', 'input', { type: 'url', pattern: 'https://.*' })}
        <div className="field">
          <label htmlFor="o-themeColour">Theme colour</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="o-themeColour" value={f.themeColour} onChange={set('themeColour')} placeholder="#rrggbb" pattern="#[0-9a-fA-F]{6}" style={{ flex: 1 }} />
            <input type="color" aria-label="Pick a colour" value={/^#[0-9a-f]{6}$/i.test(f.themeColour) ? f.themeColour : light.muted} onChange={set('themeColour')} style={{ width: 56, minHeight: 44, padding: 4 }} />
          </div>
          <span className="muted" style={{ fontSize: 13 }}>Saved now; the app does not use it yet.</span>
        </div>
        {field('milestoneMessage', 'Message after 100 hours', 'Saved now; the app does not show it yet.', 'input', { maxLength: 120 })}
        {field('hosts', 'Hosts', 'Names, separated by commas (up to 5).')}
        {field('links', 'Links', 'One per line: a short label, a space, then an https:// link (up to 5).', 'textarea')}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </section>
  );
}

type TeamData = { owner: { displayName: string; email: string } | null; operators: { id: string; displayName: string; email: string; addedAt: string }[]; slotsLeft: number };

function Team({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const t = useLoad(() => api<TeamData>(`/v1/studio/shows/${show.key}/team`), [show.key, n]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true); setError(null);
    try { await api(`/v1/studio/shows/${show.key}/team`, { method: 'POST', body: { email } }); setEmail(''); setN((x) => x + 1); }
    catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  if (t.state === 'loading') return <Loading />;
  if (t.state === 'error') return <div className="card"><Failed message={t.message} retry={t.retry} /></div>;
  return (
    <section className="card">
      <p className="muted" style={{ marginTop: 0 }}>Helpers can use everything except these settings, the team, tips, and giving the show back.</p>
      <ul className="rows">
        {t.data.owner ? <li><div className="row-main"><div className="row-title">{t.data.owner.displayName}</div><div className="row-sub">{t.data.owner.email}</div></div><span className="pill">Owner</span></li> : null}
        {t.data.operators.map((o) => (
          <li key={o.id}>
            <div className="row-main"><div className="row-title">{o.displayName}</div><div className="row-sub">{o.email} · added {shortDate(o.addedAt)}</div></div>
            <button type="button" className="linkish" onClick={() => { api(`/v1/studio/shows/${show.key}/team/${o.id}`, { method: 'DELETE' }).then(() => setN((x) => x + 1), () => setError('That did not work.')); }}>Remove</button>
          </li>
        ))}
      </ul>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {t.data.slotsLeft > 0 ? (
        <form className="toolbar" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className="sr-only" htmlFor="tm">Their SocialMorning email</label>
          <input id="tm" type="email" required placeholder="Their SocialMorning email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: '1 1 240px' }} />
          <button className="btn" type="submit" disabled={busy}>Add helper</button>
          <span className="muted">{t.data.slotsLeft} of 10 left</span>
        </form>
      ) : <p className="muted">All 10 helper places are taken.</p>}
    </section>
  );
}

function More({ show }: { show: Show }) {
  const [typed, setTyped] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { signedIn, session } = useSession();
  const navigate = useNavigate();
  const name = show.title ?? show.feedUrl;
  const release = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/studio/shows/${show.key}/release`, { method: 'POST', body: { confirm: typed } });
      if (session.state === 'in') signedIn(session.me, session.shows.filter((s) => s.key !== show.key));
      navigate('/', { replace: true });
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); setConfirm(false); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <h2>Give the show back</h2>
      <p className="muted">You stop managing {name}. Your settings, helpers and mutes are removed and open polls close. Announcements stay. You or someone else can claim the feed again later.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="field"><label htmlFor="rel">Type the show's name to confirm: <b>{name}</b></label><input id="rel" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      <button type="button" className="btn btn-quiet" disabled={typed.trim() !== name.trim()} onClick={() => setConfirm(true)}>Give the show back</button>
      {confirm ? <ConfirmDialog title={`Give back ${name}?`} body="This cannot be undone from here." confirm="Give it back" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => { void release(); }} /> : null}
    </section>
  );
}
