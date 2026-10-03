// Banner shown while the owner acts as another account, with a way back.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, HttpError } from '../api';
import { useSession } from '../session';

/**
 * M15 T030 (FR-021): while the owner acts as an account, every page says so, with a way back.
 * Everything done meanwhile is recorded with both names (the server does that, not this banner).
 */
export function ActingBanner() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session.state !== 'in' || !session.actingAs) return null;
  const back = async () => {
    setBusy(true); setError(null);
    try {
      await api('/v1/admin/act-as/stop', { method: 'POST' });
      // Leave the acted-as account's page first: refreshing while still on it sends the owner to
      // that show's fallback (/no-show) before this navigate runs (found by the e2e, run 36872853132).
      navigate('/admin/accounts');
      await refresh();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'That did not work.');
    } finally { setBusy(false); }
  };
  return (
    <div className="banner acting-banner" role="status">
      <span>Acting as <strong>{session.actingAs.displayName}</strong> — changes are made as this account and recorded under your name.</span>
      <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void back(); }}>{busy ? 'Switching…' : 'Switch back'}</button>
      {error ? <span className="muted" role="alert">{error}</span> : null}
    </div>
  );
}
