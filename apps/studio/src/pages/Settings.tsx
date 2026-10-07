// Show settings page: how the show looks, contacts, hosts, and giving it up.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, HttpError, PUBLIC_API, type Show } from '../api';
import { useSession } from '../session';
import { shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { DropZone } from '../shell/DropZone';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { SaveBar, useDirty } from '../shell/Unsaved';
import { useLoad } from '../useLoad';
import { light } from '../tokens';
import { CATEGORIES, LANGUAGES } from '../categories';
import { mb, uploadFile } from '../upload';
import { Contacts } from './settings/Contacts';
import { Hosts } from './settings/Hosts';

export type Overrides = {
  title: string | null; description: string | null; coverUrl: string | null; themeColour: string | null; milestoneMessage: string | null;
  hosts: string[] | null; links: { label: string; url: string }[] | null; contacts: { type: string; value: string }[] | null; tipsEnabled: boolean;
};

/** US6 — how the show appears, who helps, and giving it back (FR-024..FR-026). Owner only. M14 adds Contacts and Hosts. */
export function Settings({ show }: { show: Show }) {
  const tab = useLocation().pathname.split('/').at(-1);
  const base = `/s/${show.key}/settings`;
  if (show.role !== 'owner') {
    return <><PageHead title="Settings" /><div className="card"><Empty title="Only the owner can do this">Ask the show's owner to change these.</Empty></div></>;
  }
  return (
    <>
      <PageHead title="Settings" tabs={[
        { to: base, label: show.hosted ? 'Show details' : 'How it appears' }, { to: `${base}/contacts`, label: 'Contacts' },
        { to: `${base}/hosts`, label: 'Hosts' }, { to: `${base}/team`, label: 'Team' }, { to: `${base}/more`, label: 'More' },
      ]} />
      {tab === 'team' ? <Team show={show} />
        : tab === 'more' ? <More show={show} />
        : tab === 'contacts' ? <Contacts show={show} />
        : tab === 'hosts' ? <Hosts show={show} />
        : show.hosted ? <Details show={show} /> : <Appearance show={show} />}
    </>
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** M14 US1/US9: how the show looks in the app, and the public share card's link. */
function Preview({ show, title, description, cover }: { show: Show; title: string; description: string; cover: string | null }) {
  const [copied, setCopied] = useState(false);
  const link = `${PUBLIC_API}/show/${show.key}`;
  return (
    <section className="card" aria-labelledby="pv-h">
      <h2 id="pv-h">Preview</h2>
      <div className="preview-card">
        {cover ? <img src={cover} alt="" /> : <div className="ph" aria-hidden="true" />}
        <div style={{ minWidth: 0 }}>
          <div className="row-title">{title || 'Your show'}</div>
          <div className="row-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{description || 'No description yet.'}</div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>This is how your show appears in the app. The preview shows your unsaved changes.</p>
      <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>Share card</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>A public page with your cover, name and latest episodes. Anyone with the link can open it.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code className="card" style={{ padding: '10px 14px', flex: 1, overflowWrap: 'anywhere', fontSize: 13 }}>{link}</code>
        <button type="button" className="btn btn-quiet" onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined); }}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
    </section>
  );
}

type AppearanceForm = { title: string; description: string; coverUrl: string; themeColour: string; hosts: string; links: string };
const EMPTY_APPEARANCE: AppearanceForm = { title: '', description: '', coverUrl: '', themeColour: '', hosts: '', links: '' };

function Appearance({ show }: { show: Show }) {
  const o = useLoad(() => api<{ overrides: Overrides | null }>(`/v1/studio/shows/${show.key}/overrides`), [show.key]);
  const [saved, setSaved] = useState<AppearanceForm>(EMPTY_APPEARANCE);
  const [f, setF] = useState<AppearanceForm>(EMPTY_APPEARANCE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = !same(f, saved);
  useDirty(dirty);
  useEffect(() => {
    if (o.state !== 'ready') return;
    const v = o.data.overrides;
    const loaded = {
      title: v?.title ?? '', description: v?.description ?? '', coverUrl: v?.coverUrl ?? '', themeColour: v?.themeColour ?? '',
      hosts: (v?.hosts ?? []).join(', '), links: (v?.links ?? []).map((l) => `${l.label} ${l.url}`).join('\n'),
    };
    setSaved(loaded); setF(loaded);
  }, [o.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (o.state === 'loading') return <Loading lines={6} />;
  if (o.state === 'error') return <div className="card"><Failed message={o.message} retry={o.retry} /></div>;
  const set = (k: keyof AppearanceForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setMsg(null);
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const hosts = f.hosts.split(',').map((h) => h.trim()).filter(Boolean);
    const links = f.links.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(' '); return { label: l.slice(0, i).trim(), url: l.slice(i + 1).trim() }; });
    try {
      await api(`/v1/studio/shows/${show.key}/overrides`, { method: 'PUT', body: {
        title: orNull(f.title), description: orNull(f.description), coverUrl: orNull(f.coverUrl), themeColour: orNull(f.themeColour),
        hosts: hosts.length ? hosts : null, links: links.length ? links : null,
      } });
      setSaved(f);
      setMsg({ ok: true, text: 'Saved. The app shows it the next time the show page opens.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  const field = (k: keyof AppearanceForm, label: string, hint: string, el: 'input' | 'textarea' = 'input', extra: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={`o-${k}`}>{label}</label>
      {el === 'input'
        ? <input id={`o-${k}`} value={f[k]} onChange={set(k)} {...extra} />
        : <textarea id={`o-${k}`} className="textarea" rows={4} value={f[k]} onChange={set(k)} {...extra} />}
      <span className="muted" style={{ fontSize: 13 }}>{hint}</span>
    </div>
  );
  return (
    <div className="grid-2 settings-grid">
      <section className="card">
        <p className="muted" style={{ marginTop: 0 }}>Leave a field empty to use what your feed says. Your feed stays the source of everything else.</p>
        {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
        <form id="appearance" onSubmit={(e) => { e.preventDefault(); void save(); }}>
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
          {field('hosts', 'Host names', 'Names, separated by commas (up to 5). To give a host the Host mark on comments, invite them in the Hosts tab.')}
          {field('links', 'Links', 'One per line: a short label, a space, then an https:// link (up to 5).', 'textarea')}
          <SaveBar dirty={dirty} busy={busy} onSave={() => { void save(); }} onReset={() => { setF(saved); setMsg(null); }} note="The app shows saved changes the next time the show page opens." />
        </form>
      </section>
      <Preview show={show} title={f.title || show.title || ''} description={f.description} cover={f.coverUrl || show.image} />
    </div>
  );
}

/** The server's drawn cover (owner, 2026-10-04) — the same test as social-core `isAutoCover`. */
const isAutoCover = (url: string | null) => url !== null && url.includes('/covers/auto/v1/');

type HostedDetails = { title: string; description: string; author: string; language: string; category: string; explicit: boolean; coverUrl: string | null; feedUrl: string };

/** M13 US3 — a show made here: its own details and cover, which ARE its feed (not overrides of someone else's). */
function Details({ show }: { show: Show }) {
  const d = useLoad(() => api<{ show: HostedDetails }>(`/v1/studio/shows/${show.key}/details`), [show.key]);
  const [saved, setSaved] = useState<HostedDetails | null>(null);
  const [f, setF] = useState<HostedDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const dirty = f !== null && saved !== null && !same(f, saved);
  useDirty(dirty);
  useEffect(() => { if (d.state === 'ready') { setSaved(d.data.show); setF(d.data.show); } }, [d.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.state === 'loading' || (d.state === 'ready' && !f)) return <Loading lines={6} />;
  if (d.state === 'error') return <div className="card"><Failed message={d.message} retry={d.retry} /></div>;
  const v = f!;
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ show: HostedDetails }>(`/v1/studio/shows/${show.key}/details`, { method: 'PUT', body: {
        title: v.title, description: v.description, author: v.author, language: v.language, category: v.category, explicit: v.explicit, coverUrl: v.coverUrl,
      } });
      setSaved(r.show); setF(r.show); setMsg({ ok: true, text: 'Saved. Your feed shows it now.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  /** The cover uploads at once (so the preview is real) and is saved with the rest by the save bar. */
  const cover = async (file: File) => {
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: 'Choose a JPEG or PNG under 5 MB.' });
    setMsg(null); setPct(0);
    try { const url = await uploadFile(show.key, 'cover', file, setPct); setF({ ...v, coverUrl: url }); }
    catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'The cover did not upload.' }); } finally { setPct(null); }
  };
  return (
    <div className="grid-2 settings-grid">
      <section className="card">
        {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Cover (square JPEG or PNG, up to {mb(5 * 1024 * 1024)}; at least 1400 × 1400 is best)</span>
          <DropZone label="Drop a cover here, or choose one" url={v.coverUrl} busyPct={pct} onFile={(file) => { void cover(file); }} />
          {isAutoCover(v.coverUrl) ? <span className="muted" style={{ fontSize: 13 }}>Made for you from your show's name. Drop your own to replace it.</span> : null}
        </div>
        <form id="details" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="field"><label htmlFor="d-t">Show name</label><input id="d-t" required maxLength={100} value={v.title} onChange={(e) => setF({ ...v, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="d-d">Description</label><textarea id="d-d" className="textarea" rows={4} maxLength={4000} value={v.description} onChange={(e) => setF({ ...v, description: e.target.value })} /></div>
          <div className="field"><label htmlFor="d-a">Host or author name</label><input id="d-a" maxLength={100} value={v.author} onChange={(e) => setF({ ...v, author: e.target.value })} /></div>
          <div className="toolbar">
            <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="d-c">Category</label>
              <select id="d-c" className="select" value={v.category} onChange={(e) => setF({ ...v, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="d-l">Language</label>
              <select id="d-l" className="select" value={v.language} onChange={(e) => setF({ ...v, language: e.target.value })}>{LANGUAGES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></div>
          </div>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input id="d-x" type="checkbox" checked={v.explicit} onChange={(e) => setF({ ...v, explicit: e.target.checked })} style={{ width: 20, height: 20 }} />
            <label htmlFor="d-x" style={{ fontWeight: 500 }}>Contains explicit content</label>
          </div>
          <div className="field" style={{ marginTop: 24 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Your show's RSS feed</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code className="card" style={{ padding: '10px 14px', flex: 1, overflowWrap: 'anywhere' }}>{v.feedUrl}</code>
              <button type="button" className="btn btn-quiet" onClick={() => { void navigator.clipboard?.writeText(v.feedUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined); }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>Listeners find your show by name in SocialMorning. Other podcast apps can use this address too.</span>
          </div>
          <SaveBar dirty={dirty} busy={busy || pct !== null} onSave={() => { void save(); }} onReset={() => { setF(saved); setMsg(null); }} note="Saved changes are in your feed at once." />
        </form>
      </section>
      <Preview show={show} title={v.title} description={v.description} cover={v.coverUrl} />
    </div>
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
      <p className="muted">You stop managing {name}. Your settings, helpers, hosts and mutes are removed and open polls close. Announcements stay. {show.hosted ? 'A show made here is taken down: its feed stops and its audio is deleted.' : 'You or someone else can claim the feed again later.'}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="field"><label htmlFor="rel">Type the show's name to confirm: <b>{name}</b></label><input id="rel" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      <button type="button" className="btn btn-quiet" disabled={typed.trim() !== name.trim()} onClick={() => setConfirm(true)}>Give the show back</button>
      {confirm ? <ConfirmDialog title={`Give back ${name}?`} body="This cannot be undone from here." confirm="Give it back" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => { void release(); }} /> : null}
    </section>
  );
}
