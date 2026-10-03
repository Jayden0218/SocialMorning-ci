// Admin page to find an account, rename it, and suspend or restore it.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty } from '../../shell/States';
import { errorText } from './common';

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
    </li>
  );
}
