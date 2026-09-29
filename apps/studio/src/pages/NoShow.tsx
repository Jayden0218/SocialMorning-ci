import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { useSession } from '../session';

type Claim = { id: string; feedUrl: string; code: string; status: 'pending' | 'proven' | 'revoked' };

/**
 * Signed in, no show yet: claim one right here (the same proof as the app's creator centre —
 * the code must appear in the live feed, so nobody reaches another creator's show by asking).
 */
export function NoShow() {
  const { session, signedIn, signOut } = useSession();
  const navigate = useNavigate();
  const [feedUrl, setFeedUrl] = useState('');
  const [claim, setClaim] = useState<Claim | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pick up a claim already started (here or in the app).
  useEffect(() => {
    api<{ claims: Claim[] }>('/v1/studio/claims').then((r) => { const open = r.claims.find((c) => c.status === 'pending'); if (open) { setClaim(open); setFeedUrl(open.feedUrl); } }, () => undefined);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setNote(null);
    try { await fn(); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  const start = () => run(async () => {
    const r = await api<{ claim: Claim }>('/v1/studio/claims', { method: 'POST', body: { feedUrl: feedUrl.trim() } });
    setClaim(r.claim);
  });
  const verify = () => run(async () => {
    if (!claim) return;
    const r = await api<{ status: Claim['status']; shows: Show[] }>(`/v1/studio/claims/${claim.id}/verify`, { method: 'POST' });
    if (r.status === 'proven' && r.shows[0] && session.state === 'in') {
      signedIn(session.me, r.shows);
      navigate(`/s/${r.shows[0].key}/home`, { replace: true });
      return;
    }
    setNote('The code is not in your feed yet. Feeds can take a few minutes to update after you publish — try again shortly.');
  });
  const copy = async () => {
    if (!claim) return;
    try { await navigator.clipboard.writeText(claim.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the code is selectable too */ }
  };

  return (
    <main className="auth-form" style={{ minHeight: '100%' }}>
      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 24 }}><span className="brand-mark" aria-hidden="true">S</span>SocialMorning Studio</div>
        <h1 style={{ fontSize: 28, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Add your show</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {session.state === 'in' ? `${session.me.displayName}, prove` : 'Prove'} the podcast is yours once, and the Studio opens on it.
        </p>
        {error ? <p className="error" role="alert">{error}</p> : null}

        <form onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <div className="field">
            <label htmlFor="feed">1. Your podcast's RSS feed address</label>
            <input id="feed" type="url" required placeholder="https://…/feed.xml" value={feedUrl} disabled={claim !== null} onChange={(e) => setFeedUrl(e.target.value)} />
          </div>
          {claim === null ? <button className="btn" type="submit" disabled={busy || !feedUrl.trim()}>{busy ? 'One moment…' : 'Get my code'}</button> : null}
        </form>

        {claim ? (
          <>
            <div className="field" style={{ marginTop: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>2. Put this code anywhere in your feed — the show description is easiest — and publish</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code className="card" style={{ padding: '10px 14px', flex: 1, overflowWrap: 'anywhere' }}>{claim.code}</code>
                <button type="button" className="btn btn-quiet" onClick={() => { void copy(); }}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
            <div className="field">
              <span style={{ fontWeight: 600, fontSize: 14 }}>3. Check it</span>
              {note ? <p className="muted" role="status" style={{ margin: 0 }}>{note}</p> : null}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn" disabled={busy} onClick={() => { void verify(); }}>{busy ? 'Checking your feed…' : 'Verify'}</button>
                <button type="button" className="btn btn-quiet" onClick={() => { setClaim(null); setNote(null); }}>Use another feed</button>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>You can remove the code from your feed once the Studio opens.</p>
          </>
        ) : null}

        <p className="muted" style={{ marginTop: 32 }}>Someone else owns the show? Ask them to add you as a helper in Settings → Team.</p>
        <button type="button" className="btn btn-quiet" onClick={() => { void signOut(); }}>Sign out</button>
      </div>
    </main>
  );
}
