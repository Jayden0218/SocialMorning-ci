// Admin page to find an account, see it in full, rename it, suspend or restore it, and give or take PLUS.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText } from './common';
import { HideEverywhere } from './hide';

type User = { id: string; displayName: string; email: string; createdAt: string; suspended: boolean; madeByAdmin: boolean };

/**
 * M15 T039 (FR-030): find an account by name or email, rename it, suspend or restore it. Suspend
 * and restore are the same moderation action `/mod` takes, so both pages agree (G-U1).
 */
export function Users() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<User[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ user: User; to: 'suspend' | 'restore' } | null>(null);
  const search = async (term = q) => {
    if (!term.trim()) return;
    setBusy(true); setError(null);
    try { setItems((await api<{ items: User[] }>(`/v1/admin/users?q=${encodeURIComponent(term.trim())}`)).items); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const replace = (u: User) => setItems((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
  const suspend = async (u: User, to: 'suspend' | 'restore') => {
    setBusy(true); setError(null);
    try { replace((await api<{ user: User }>(`/v1/admin/users/${u.id}/${to}`, { method: 'POST' })).user); setAsking(null); }
    catch (e) { setError(errorText(e)); setAsking(null); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Users" sub="Search by name or email. Suspending refuses the account everywhere, with the appeals address." />
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label className="sr-only" htmlFor="u-q">Name or email</label>
        <input id="u-q" type="search" maxLength={80} placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !q.trim()}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="card" aria-label="Accounts found">
        {items === null ? <Empty title="Search to find an account" /> : items.length === 0 ? <Empty title="No account matches" /> : (
          <ul className="rows">
            {items.map((u) => <UserRow key={u.id} u={u} busy={busy} onRenamed={replace} onSuspend={(to) => setAsking({ user: u, to })} />)}
          </ul>
        )}
      </section>
      {asking ? (
        <ConfirmDialog
          title={asking.to === 'suspend' ? `Suspend ${asking.user.displayName}?` : `Restore ${asking.user.displayName}?`}
          body={asking.to === 'suspend' ? 'The account is refused on every request until restored. Its open reports close.' : 'The account works again at once.'}
          confirm={asking.to === 'suspend' ? 'Suspend' : 'Restore'} busy={busy}
          onCancel={() => setAsking(null)} onConfirm={() => { void suspend(asking.user, asking.to); }} />
      ) : null}
    </>
  );
}

function UserRow({ u, busy, onRenamed, onSuspend }: { u: User; busy: boolean; onRenamed: (u: User) => void; onSuspend: (to: 'suspend' | 'restore') => void }) {
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const [name, setName] = useState(u.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rename = async () => {
    setSaving(true); setError(null);
    try { onRenamed((await api<{ user: User }>(`/v1/admin/users/${u.id}`, { method: 'PATCH', body: { displayName: name.trim() } })).user); setEditing(false); }
    catch (e) { setError(errorText(e)); } finally { setSaving(false); }
  };
  return (
    <li style={{ flexWrap: 'wrap' }}>
      <div className="row-main">
        <div className="row-title">{u.displayName} {u.suspended ? <span className="pill pill-warn">Suspended</span> : null} {u.madeByAdmin ? <span className="pill">Made in Admin</span> : null}</div>
        <div className="row-sub">{u.email} · joined {shortDate(u.createdAt)}</div>
      </div>
      <div className="pick-actions">
        <button type="button" className="btn btn-quiet" aria-expanded={details} onClick={() => setDetails((x) => !x)}>Details<span className="sr-only"> {u.displayName}</span></button>
        <button type="button" className="btn btn-quiet" aria-expanded={editing} onClick={() => setEditing((x) => !x)}>Rename<span className="sr-only"> {u.displayName}</span></button>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onSuspend(u.suspended ? 'restore' : 'suspend')}>
          {u.suspended ? 'Restore' : 'Suspend'}<span className="sr-only"> {u.displayName}</span>
        </button>
      </div>
      {editing ? (
        <form className="toolbar" style={{ flexBasis: '100%', marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); void rename(); }}>
          <label className="sr-only" htmlFor={`rn-${u.id}`}>New display name</label>
          <input id={`rn-${u.id}`} maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save name'}</button>
        </form>
      ) : null}
      {error ? <p className="error" role="alert" style={{ flexBasis: '100%' }}>{error}</p> : null}
      {details ? <UserDetail id={u.id} /> : null}
    </li>
  );
}

export type Detail = {
  user: User; avatarUrl: string | null; bio: string | null; sessions: number;
  plus: { active: boolean; until: string | null; byAdmin: boolean };
  purchases: { id: string; productId: string; store: string; status: string; amountMicros: number | null; currency: string | null; createdAt: string }[];
  tips: { id: string; feedUrl: string; status: string; createdAt: string }[];
  gifts: { id: string; feedUrl: string; role: 'bought' | 'received'; claimedAt: string | null; cancelledAt: string | null; createdAt: string }[];
  reportsAgainst: { id: string; targetKind: string; reason: string; createdAt: string; closeReason: string | null }[];
  /** M25 A3: shows this account made in the Studio (absent from an older server). */
  shows?: { feedUrl: string; title: string; hidden: boolean }[];
  deletion: { requestedAt: string; dueAt: string } | null;
};

/** A store amount in micros → "4.99 USD"; unknown → "—". */
export const money = (micros: number | null, currency: string | null): string => (micros === null ? '—' : `${(micros / 1_000_000).toFixed(2)} ${currency ?? ''}`.trim());

/**
 * M24 US5: one account in full — purchases, PLUS, tips, gifts, reports against it, sessions, a
 * pending deletion; PLUS by hand (recorded) and removing an abusive photo or bio.
 */
export function UserDetail({ id }: { id: string }) {
  const [n, setN] = useState(0);
  const data = useLoad(() => api<Detail>(`/v1/admin/users/${id}`), [id, n]);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ title: string; body: string; confirm: string; run: () => Promise<unknown> } | null>(null);
  const go = async (run: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await run(); setN((x) => x + 1); } catch (e) { setError(errorText(e)); } finally { setBusy(false); setAsking(null); }
  };
  if (data.state === 'loading') return <div style={{ flexBasis: '100%' }}><Loading lines={2} /></div>;
  if (data.state === 'error') return <div style={{ flexBasis: '100%' }}><Failed message={data.message} retry={data.retry} /></div>;
  const d = data.data;
  return (
    <div className="card" style={{ flexBasis: '100%', marginTop: 8 }} aria-label={`Details of ${d.user.displayName}`}>
      <p className="row-sub">{d.sessions} signed-in device{d.sessions === 1 ? '' : 's'}{d.deletion ? ` · deletion on ${shortDate(d.deletion.dueAt)}` : ''}</p>
      <p>
        PLUS: {d.plus.active ? <span className="pill">Active{d.plus.until ? ` until ${shortDate(d.plus.until)}` : ''}{d.plus.byAdmin ? ' · given here' : ''}</span> : <span className="pill">None</span>}
      </p>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setAsking({ title: `Give PLUS for ${days} days?`, body: 'Recorded in Activity.', confirm: 'Give PLUS', run: () => api(`/v1/admin/users/${id}/plus`, { method: 'POST', body: { days } }) }); }}>
        <label htmlFor={`plus-${id}`}>Days</label>
        <input id={`plus-${id}`} type="number" min={1} max={3660} value={days} onChange={(e) => setDays(Math.max(1, Math.min(3660, Number(e.target.value) || 1)))} />
        <button className="btn" type="submit" disabled={busy}>Give PLUS</button>
        {d.plus.active ? <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => setAsking({ title: 'Take PLUS away?', body: 'Every PLUS on this account ends now, bought or given. Recorded in Activity.', confirm: 'Take away', run: () => api(`/v1/admin/users/${id}/plus`, { method: 'DELETE' }) })}>Take PLUS away</button> : null}
      </form>
      <div className="toolbar">
        {d.avatarUrl ? <><img src={d.avatarUrl} alt={`${d.user.displayName}'s photo`} width={48} height={48} style={{ borderRadius: 24, objectFit: 'cover' }} /><button className="btn btn-quiet" type="button" disabled={busy} onClick={() => setAsking({ title: 'Remove this photo?', body: 'It is deleted from storage.', confirm: 'Remove photo', run: () => api(`/v1/admin/users/${id}/avatar`, { method: 'DELETE' }) })}>Remove photo</button></> : <span className="muted">No photo</span>}
      </div>
      <div className="toolbar">
        {d.bio ? <><span className="row-body">Bio: {d.bio}</span><button className="btn btn-quiet" type="button" disabled={busy} onClick={() => setAsking({ title: 'Remove this bio?', body: 'The bio becomes empty.', confirm: 'Remove bio', run: () => api(`/v1/admin/users/${id}/bio`, { method: 'DELETE' }) })}>Remove bio</button></> : <span className="muted">No bio</span>}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <h3>Purchases</h3>
      {d.purchases.length === 0 ? <p className="muted">None</p> : <ul className="rows">{d.purchases.map((p) => <li key={p.id}><span>{p.productId} · {p.store}</span><span className="row-side">{money(p.amountMicros, p.currency)} · {p.status} · {shortDate(p.createdAt)}</span></li>)}</ul>}
      <h3>Tips sent</h3>
      {d.tips.length === 0 ? <p className="muted">None</p> : <ul className="rows">{d.tips.map((t) => <li key={t.id}><span>{t.feedUrl}</span><span className="row-side">{t.status} · {shortDate(t.createdAt)}</span></li>)}</ul>}
      <h3>Gifts</h3>
      {d.gifts.length === 0 ? <p className="muted">None</p> : <ul className="rows">{d.gifts.map((g) => <li key={g.id}><span>{g.role} · {g.feedUrl}</span><span className="row-side">{g.cancelledAt ? 'cancelled' : g.claimedAt ? `claimed ${shortDate(g.claimedAt)}` : 'not claimed'}</span></li>)}</ul>}
      {d.shows && d.shows.length > 0 ? (
        <>
          <h3>Shows made in the Studio</h3>
          <ul className="rows">{d.shows.map((sh) => <li key={sh.feedUrl}><span>{sh.title}</span><span className="row-side">{sh.hidden ? 'Hidden from listeners (Admin › Lists to show it again)' : <HideEverywhere feedUrl={sh.feedUrl} name={sh.title} onDone={() => setN((x) => x + 1)} />}</span></li>)}</ul>
        </>
      ) : null}
      <h3>Reports against</h3>
      {d.reportsAgainst.length === 0 ? <p className="muted">None</p> : <ul className="rows">{d.reportsAgainst.map((r) => <li key={r.id}><span>{r.targetKind} · {r.reason}</span><span className="row-side">{r.closeReason ?? 'open'} · {shortDate(r.createdAt)}</span></li>)}</ul>}
      {asking ? <ConfirmDialog title={asking.title} body={asking.body} confirm={asking.confirm} busy={busy} onCancel={() => setAsking(null)} onConfirm={() => { void go(asking.run); }} /> : null}
    </div>
  );
}
