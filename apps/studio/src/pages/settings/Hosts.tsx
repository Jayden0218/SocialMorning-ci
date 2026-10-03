// Settings section to invite hosts by a one-use link and remove them.
import { useState } from 'react';
import { api, HttpError, type Show } from '../../api';
import { shortDate } from '../../format';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';

const MAX_HOSTS = 5;
type Host = { id: string; displayName: string; addedAt: string };
type Invite = { id: string; createdAt: string; expiresAt: string };

/**
 * M14 US2 (FR-02, FR-03): invite a host by a one-use link that lasts 4 days. A host's comments
 * on the show carry the Host mark. Hosts do not get the Studio — that is Team.
 */
export function Hosts({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const hosts = useLoad(() => api<{ hosts: Host[] }>(`/v1/studio/shows/${show.key}/hosts`), [show.key, n]);
  const invites = useLoad(() => api<{ invites: Invite[] }>(`/v1/studio/shows/${show.key}/host-invites`), [show.key, n]);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Host | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); setN((x) => x + 1); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  const create = () => run(async () => {
    const r = await api<{ url: string; expiresAt: string }>(`/v1/studio/shows/${show.key}/host-invites`, { method: 'POST' });
    setFresh(r); setCopied(false);
  });
  const copy = () => { if (fresh) void navigator.clipboard?.writeText(fresh.url).then(() => setCopied(true), () => undefined); };

  if (hosts.state === 'loading' || invites.state === 'loading') return <Loading lines={4} />;
  if (hosts.state === 'error') return <div className="card"><Failed message={hosts.message} retry={hosts.retry} /></div>;
  if (invites.state === 'error') return <div className="card"><Failed message={invites.message} retry={invites.retry} /></div>;
  const list = hosts.data.hosts;
  const full = list.length >= MAX_HOSTS;

  return (
    <>
      <section className="card" aria-labelledby="h-h">
        <h2 id="h-h">Hosts</h2>
        <p className="muted" style={{ marginTop: 0 }}>The people who speak on your show. Their comments on your episodes carry the Host mark, like yours. Up to {MAX_HOSTS}.</p>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {list.length === 0 ? <p className="muted">No hosts yet. Invite one below.</p> : (
          <ul className="avatars" aria-label="Hosts" style={{ listStyle: 'none', padding: 0 }}>
            {list.map((h) => (
              <li key={h.id} className="avatar">
                <span className="circle" aria-hidden="true">{h.displayName.slice(0, 1).toUpperCase()}</span>
                <span>{h.displayName}</span>
                <span className="muted" style={{ fontSize: 12 }}>since {shortDate(h.addedAt)}</span>
                <button type="button" className="linkish" onClick={() => setRemoving(h)}>Remove<span className="sr-only"> {h.displayName}</span></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="hi-h" style={{ marginTop: 16 }}>
        <h2 id="hi-h">Invite a host</h2>
        <p className="muted" style={{ marginTop: 0 }}>Make a link and send it to them yourself. It works once and lasts 4 days. They sign in with their SocialMorning account to accept.</p>
        {fresh ? (
          <div className="field" role="status">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Your invite link — copy it now; it is not shown again</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code className="card" style={{ padding: '10px 14px', flex: 1, overflowWrap: 'anywhere', fontSize: 13 }}>{fresh.url}</code>
              <button type="button" className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>Works until {shortDate(fresh.expiresAt)}.</span>
          </div>
        ) : null}
        {full ? <p className="muted">Your show has {MAX_HOSTS} hosts. Remove one to invite another.</p>
          : <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void create(); }}>{busy ? 'One moment…' : 'Make an invite link'}</button>}
        {invites.data.invites.length > 0 ? (
          <>
            <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Links not used yet</h3>
            <ul className="rows">
              {invites.data.invites.map((i) => (
                <li key={i.id}>
                  <div className="row-main"><div className="row-title">Made {shortDate(i.createdAt)}</div><div className="row-sub">Works until {shortDate(i.expiresAt)}</div></div>
                  <button type="button" className="linkish" disabled={busy} onClick={() => { void run(async () => { await api(`/v1/studio/shows/${show.key}/host-invites/${i.id}`, { method: 'DELETE' }); if (fresh) setFresh(null); }); }}>Cancel link<span className="sr-only"> made {shortDate(i.createdAt)}</span></button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
      {removing ? (
        <ConfirmDialog title={`Remove ${removing.displayName}?`} body="Their comments stay, without the Host mark. You can invite them again." confirm="Remove" busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => { const h = removing; setRemoving(null); void run(async () => { await api(`/v1/studio/shows/${show.key}/hosts/${h.id}`, { method: 'DELETE' }); }); }} />
      ) : null}
    </>
  );
}
