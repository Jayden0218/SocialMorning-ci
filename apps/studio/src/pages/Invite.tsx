// Page an invite link opens, where a person accepts becoming a show host.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, HttpError } from '../api';
import { shortDate } from '../format';
import { Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import { useSession } from '../session';

type Preview = { state: 'open' | 'used' | 'expired' | 'revoked' | 'unknown'; showTitle?: string | null; expiresAt?: string };

const WHY: Record<Exclude<Preview['state'], 'open'>, string> = {
  used: 'This invite link was already used.',
  expired: 'This invite link has expired. Ask the show\'s owner for a new one.',
  revoked: 'The owner cancelled this invite link. Ask them for a new one.',
  unknown: 'This invite link is not valid. Check you copied all of it, or ask the owner for a new one.',
};

/** M14 US2 — the page an invite link opens: which show, then accept as the signed-in account. */
export function Invite() {
  const { token = '' } = useParams();
  const { session } = useSession();
  const p = useLoad(() => api<Preview>(`/v1/studio/invites/${encodeURIComponent(token)}`), [token]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true); setError(null);
    try { await api(`/v1/studio/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }); setDone(true); }
    catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  const name = p.state === 'ready' ? p.data.showTitle ?? 'a show' : '';
  return (
    <main className="auth-form" style={{ minHeight: '100%' }}>
      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 24 }}><span className="brand-mark" aria-hidden="true">S</span>SocialMorning Studio</div>
        {p.state === 'loading' ? <Loading label="Invite" /> : null}
        {p.state === 'error' ? <Failed message={p.message} retry={p.retry} /> : null}
        {p.state === 'ready' && done ? (
          <>
            <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>You are a host of {name}</h1>
            <p className="muted" role="status">Your comments on its episodes now carry the Host mark in the app.</p>
            <Link className="btn" to="/" style={{ textDecoration: 'none' }}>Go to the Studio</Link>
          </>
        ) : null}
        {p.state === 'ready' && !done && p.data.state === 'open' ? (
          <>
            <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Join {name} as a host</h1>
            <p className="muted">Your comments on its episodes will carry the Host mark. You accept as <b>{session.state === 'in' ? session.me.displayName : ''}</b>{session.state === 'in' ? ` (${session.me.email})` : ''}. This link works until {shortDate(p.data.expiresAt!)}.</p>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button type="button" className="btn" disabled={busy} onClick={() => { void accept(); }}>{busy ? 'One moment…' : 'Accept'}</button>
          </>
        ) : null}
        {p.state === 'ready' && !done && p.data.state !== 'open' ? (
          <>
            <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>This invite cannot be used</h1>
            <p role="alert">{WHY[p.data.state]}</p>
            <Link to="/">Go to the Studio</Link>
          </>
        ) : null}
      </div>
    </main>
  );
}
