// Page for a signed-in person with no show: create one or claim a feed.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { CATEGORIES, LANGUAGES } from '../categories';
import { useSession } from '../session';
import { ActingBanner } from '../shell/ActingBanner';

type Claim = { id: string; feedUrl: string; code: string; status: 'pending' | 'proven' | 'revoked' };

/**
 * Signed in, no show yet. First choice (M13, owner 2026-09-29 "like 小宇宙"): create a show here —
 * one form, no proof, because a show made here is yours. Second choice: a creator who already
 * publishes an RSS feed elsewhere brings it (the code must appear in the live feed).
 */
export function NoShow() {
  const [mode, setMode] = useState<'create' | 'claim'>('create');
  const { session, signOut } = useSession();
  return (
    <main className="auth-form" style={{ minHeight: '100%' }}>
      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 24 }}><span className="brand-mark" aria-hidden="true">S</span>SocialMorning Studio</div>
        {/* M15: an account made in Admin often has no show yet — the way back must still be on screen. */}
        <ActingBanner />
        {session.state === 'in' && session.isAdmin && !session.actingAs ? <p><Link to="/admin">Open Admin</Link></p> : null}
        {mode === 'create' ? <CreateShow /> : <ClaimFeed />}
        <p className="muted" style={{ marginTop: 32 }}>
          {mode === 'create'
            ? <>Already publish your podcast somewhere else? <button type="button" className="linkish" onClick={() => setMode('claim')}>Bring your existing feed</button></>
            : <>No feed yet? <button type="button" className="linkish" onClick={() => setMode('create')}>Create a new show here</button></>}
        </p>
        <p className="muted">{session.state === 'in' ? `Signed in as ${session.me.displayName}. ` : ''}Someone else owns the show? Ask them to add you as a helper in Settings → Team.</p>
        <button type="button" className="btn btn-quiet" onClick={() => { void signOut(); }}>Sign out</button>
      </div>
    </main>
  );
}

function CreateShow() {
  const { session, signedIn } = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', description: '', category: 'Society & Culture', language: 'zh' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ shows: Show[]; show: { feedUrl: string } }>('/v1/studio/hosted-shows', {
        method: 'POST', body: { title: f.title.trim(), description: f.description.trim(), category: f.category, language: f.language },
      });
      const mine = r.shows.find((s) => s.feedUrl === r.show.feedUrl) ?? r.shows[0];
      if (session.state === 'in' && mine) {
        signedIn(session.me, r.shows);
        navigate(`/s/${mine.key}/episodes/new`, { replace: true });
      }
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  return (
    <>
      <h1 style={{ fontSize: 28, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Create your show</h1>
      <p className="muted" style={{ marginTop: 0 }}>Give it a name. You can change everything later, and upload your first episode next.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div className="field"><label htmlFor="cs-t">Show name</label><input id="cs-t" required maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="cs-d">What is it about? (optional)</label><textarea id="cs-d" className="textarea" rows={3} maxLength={4000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="toolbar">
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label htmlFor="cs-c">Category</label>
            <select id="cs-c" className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label htmlFor="cs-l">Language</label>
            <select id="cs-l" className="select" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
        </div>
        <button className="btn" type="submit" disabled={busy || !f.title.trim()}>{busy ? 'Creating…' : 'Create show'}</button>
      </form>
    </>
  );
}

/** For a creator who already publishes elsewhere: prove the feed once (the code must be in the live feed). */
function ClaimFeed() {
  const { session, signedIn } = useSession();
  const navigate = useNavigate();
  const [feedUrl, setFeedUrl] = useState('');
  const [claim, setClaim] = useState<Claim | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    <>
      <h1 style={{ fontSize: 28, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Bring your existing feed</h1>
      <p className="muted" style={{ marginTop: 0 }}>Prove the feed is yours once, and the Studio opens on it. Episodes keep coming from where you publish them.</p>
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
    </>
  );
}
