import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api';
import { shortDate } from '../../format';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useSession } from '../../session';
import { useLoad } from '../../useLoad';
import { errorText, Finder } from './common';

type Account = { id: string; email: string; displayName: string; bio: string | null; createdAt: string; suspended: boolean; placeholderEmail: boolean };
type Curator = { feedUrl: string; curator: { id: string; displayName: string }; createdAt: string };
type Result = { ok: true; id: string } | { ok: false; reason: string };
type Row = { displayName: string; bio?: string; email?: string };

/** One account per line: `Name | bio | email` — bio and email optional. */
export function parseList(text: string): Row[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name = '', bio = '', email = ''] = l.split('|').map((x) => x.trim());
    return { displayName: name, ...(bio ? { bio } : {}), ...(email ? { email } : {}) };
  });
}

/**
 * M15 T030 (FR-019–FR-023): accounts the owner makes — one, or many from a pasted list with a
 * result per row — edited, "acted as" in the Studio, and attached as the CURATOR of an external
 * show (the app says "Shared by <name>", never host).
 */
export function Accounts() {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: Account[]; curators: Curator[] }>('/v1/admin/accounts'), [n]);
  const reload = () => setN((x) => x + 1);
  return (
    <>
      <PageHead title="Accounts" sub="Accounts you make follow every rule listeners follow. An email lets the account sign in with a code." />
      <div className="grid-2" style={{ marginTop: 0 }}>
        <CreateOne onMade={reload} />
        <CreateMany onMade={reload} />
      </div>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="acc-h">
        <h2 id="acc-h">Accounts made in Admin</h2>
        {list.state === 'loading' ? <Loading /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="None yet" /> : null}
        {list.state === 'ready' ? <ul className="rows">{list.data.items.map((a) => <AccountRow key={a.id} a={a} onChanged={reload} />)}</ul> : null}
      </section>
      {list.state === 'ready' ? <Curators accounts={list.data.items} curators={list.data.curators} onChanged={reload} /> : null}
    </>
  );
}

function CreateOne({ onMade }: { onMade: () => void }) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const create = async () => {
    setBusy(true); setMsg(null);
    try {
      const { results } = await api<{ results: Result[] }>('/v1/admin/accounts', { method: 'POST', body: { accounts: [{ displayName: name.trim(), ...(bio.trim() ? { bio: bio.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}) }] } });
      const r = results[0];
      if (r && r.ok) { setName(''); setBio(''); setEmail(''); setMsg('Created.'); onMade(); } else setMsg(r && !r.ok ? r.reason : 'Not created.');
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="one-h">
      <h2 id="one-h">New account</h2>
      {msg ? <p className="muted" role="status">{msg}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div className="field"><label htmlFor="a-name">Display name ({name.trim().length} / 40)</label><input id="a-name" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="a-bio">Bio, optional ({bio.trim().length} / 160)</label><textarea id="a-bio" className="textarea" rows={2} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
        <div className="field"><label htmlFor="a-email">Email, optional</label><input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn" type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </section>
  );
}

function CreateMany({ onMade }: { onMade: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ row: Row; result: Result }[] | null>(null);
  const rows = parseList(text);
  const create = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const { results } = await api<{ results: Result[] }>('/v1/admin/accounts', { method: 'POST', body: { accounts: rows } });
      setDone(rows.map((row, i) => ({ row, result: results[i] ?? { ok: false, reason: 'No answer for this row.' } })));
      if (results.some((r) => r.ok)) onMade();
      setText(rows.filter((_, i) => !results[i]?.ok).map((r) => [r.displayName, r.bio ?? '', r.email ?? ''].join(' | ').replace(/( \| )+$/, '')).join('\n'));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="many-h">
      <h2 id="many-h">Many at once</h2>
      <div className="field">
        <label htmlFor="a-list">One per line: Name | bio | email (bio and email optional; up to 50)</label>
        <textarea id="a-list" className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="button" className="btn" disabled={busy || rows.length === 0 || rows.length > 50} onClick={() => { void create(); }}>
        {busy ? 'Creating…' : `Create ${rows.length} account${rows.length === 1 ? '' : 's'}`}
      </button>
      {done ? (
        <ul className="rows" aria-label="Results" style={{ marginTop: 12 }}>
          {done.map((d, i) => (
            <li key={i}>
              <span>{d.row.displayName}</span>
              <span className={d.result.ok ? 'muted' : 'pill pill-warn'}>{d.result.ok ? 'created' : d.result.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AccountRow({ a, onChanged }: { a: Account; onChanged: () => void }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.displayName);
  const [bio, setBio] = useState(a.bio ?? '');
  const [email, setEmail] = useState(a.placeholderEmail ? '' : a.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/admin/accounts/${a.id}`, { method: 'PATCH', body: { displayName: name.trim(), bio: bio.trim() || null, ...(email.trim() ? { email: email.trim() } : {}) } });
      setEditing(false); onChanged();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const actAs = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/admin/act-as/${a.id}`, { method: 'POST' });
      await refresh();
      navigate('/');
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <li style={{ flexWrap: 'wrap' }}>
      <div className="row-main">
        <div className="row-title">{a.displayName} {a.suspended ? <span className="pill">Suspended</span> : null}</div>
        <div className="row-sub">{a.placeholderEmail ? 'No email — cannot sign in yet' : a.email} · made {shortDate(a.createdAt)}</div>
        {a.bio ? <div className="row-body">{a.bio}</div> : null}
      </div>
      <div className="pick-actions">
        <button type="button" className="btn btn-quiet" onClick={() => setEditing((x) => !x)} aria-expanded={editing}>Edit<span className="sr-only"> {a.displayName}</span></button>
        <button type="button" className="btn" disabled={busy} onClick={() => { void actAs(); }}>Act as<span className="sr-only"> {a.displayName}</span></button>
      </div>
      {error ? <p className="error" role="alert" style={{ flexBasis: '100%' }}>{error}</p> : null}
      {editing ? (
        <form style={{ flexBasis: '100%' }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="field"><label htmlFor={`n-${a.id}`}>Display name</label><input id={`n-${a.id}`} maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor={`b-${a.id}`}>Bio ({bio.trim().length} / 160)</label><textarea id={`b-${a.id}`} className="textarea" rows={2} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
          <div className="field"><label htmlFor={`e-${a.id}`}>Email (lets it sign in with a code)</label><input id={`e-${a.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn" type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </form>
      ) : null}
    </li>
  );
}

function Curators({ accounts, curators, onChanged }: { accounts: Account[]; curators: Curator[]; onChanged: () => void }) {
  const [feedUrl, setFeedUrl] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const put = async (feed: string, listenerId: string | null) => {
    setBusy(true); setError(null);
    try { await api('/v1/admin/curators', { method: 'PUT', body: { feedUrl: feed, listenerId } }); setFeedUrl(''); onChanged(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="cur-h">
      <h2 id="cur-h">Curators of external shows</h2>
      <p className="muted">The app shows “Shared by &lt;name&gt;” on the show page. A curator is never called the host; a verified creator claim makes the real creator the host.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Finder label="Find the show" kind="show" onPick={(x) => setFeedUrl(x.feedUrl)} />
      <div className="toolbar">
        <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="cur-feed">Feed URL</label><input id="cur-feed" type="url" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="cur-who">Account</label>
          <select id="cur-who" className="select" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </select>
        </div>
        <button type="button" className="btn" disabled={busy || !who || !/^https?:\/\//.test(feedUrl)} onClick={() => { void put(feedUrl.trim(), who); }}>Set curator</button>
      </div>
      {curators.length === 0 ? <Empty title="No curated shows yet" /> : (
        <ul className="rows">
          {curators.map((c) => (
            <li key={c.feedUrl}>
              <div className="row-main"><div className="row-title">Shared by {c.curator.displayName}</div><div className="row-sub">{c.feedUrl}</div></div>
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void put(c.feedUrl, null); }}>Remove<span className="sr-only"> curator of {c.feedUrl}</span></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
