// Settings card for a claimed feed: when it was last fetched, whether that worked, and "Sync now".
import { useEffect, useState } from 'react';
import { api, HttpError, type Show } from '../../api';
import { Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';

export type FeedSyncStatus = { hosted: boolean; fetchedAt: string | null; ok: boolean | null; error: string | null; nextManualAt: string | null };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** M24 US10: the feed's last fetch. "Sync now" works once every 10 minutes; the server decides, this only waits with it. */
export function FeedSync({ show }: { show: Show }) {
  const s = useLoad(() => api<FeedSyncStatus>(`/v1/studio/shows/${show.key}/feed-sync`), [show.key]);
  const [data, setData] = useState<FeedSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (s.state === 'ready') setData(s.data); }, [s.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = data?.nextManualAt ? Date.parse(data.nextManualAt) : 0;
  const waiting = next > now;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(next - now + 500, 600_000));
    return () => clearTimeout(t);
  }, [waiting, next, now]);
  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<FeedSyncStatus>(`/v1/studio/shows/${show.key}/feed-sync`, { method: 'POST' });
      setData(r); setNow(Date.now());
      setMsg(r.ok === false ? { ok: false, text: 'The feed did not load. See the error above.' } : { ok: true, text: 'Synced. New episodes are in the app now.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not work.' }); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="fs-h" style={{ marginTop: 16 }}>
      <h2 id="fs-h">Feed</h2>
      {s.state === 'error' ? <Failed message={s.message} retry={s.retry} /> : null}
      {s.state === 'loading' || (s.state === 'ready' && !data) ? <Loading lines={2} label="Feed status" /> : null}
      {data ? (
        <>
          <p style={{ marginTop: 0 }}>{data.fetchedAt ? `Last fetched ${when(data.fetchedAt)}` : 'Not fetched yet'}</p>
          {data.ok === true ? <p className="muted">OK: the last fetch worked.</p> : null}
          {data.ok === false ? <p className="error">The last fetch failed: {data.error ?? 'no reason given.'}</p> : null}
          {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
          <button type="button" className="btn btn-quiet" disabled={busy || waiting} onClick={() => { void sync(); }}>{busy ? 'Syncing…' : 'Sync now'}</button>
          <p className="muted" style={{ fontSize: 13 }}>
            {waiting ? `Sync now works again at ${when(data.nextManualAt!)}. ` : ''}The app also checks your feed by itself. Sync now works once every 10 minutes.
          </p>
        </>
      ) : null}
    </section>
  );
}
