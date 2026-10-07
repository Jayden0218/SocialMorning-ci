// Page listing subscribers and trends, and muting listeners from commenting.
import { useState } from 'react';
import { useLocation } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { HourBars, SubTrend } from '../charts/Small';
import { browserTz, num, shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { Pager, Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';

type Stats = { total: number; trend: { date: string; sub: number; unsub: number }[]; hours: number[]; platforms: { ios: number; android: number; unknown: number }; historySince: string | null };
type Sub = { id: string; displayName: string; subscribedAt: string; muted: boolean };
type Muted = { id: string; displayName: string; mutedAt: string; mutedBy: string | null };

/** US4 — who subscribes, and who may not comment (FR-017..FR-019). */
export function Subscribers({ show }: { show: Show }) {
  const tab = useLocation().pathname.split('/').at(-1);
  const base = `/s/${show.key}/subscribers`;
  return (
    <>
      <PageHead title="Subscribers" sub="Who follows your show, and how that changes."
        tabs={[{ to: base, label: 'Overview' }, { to: `${base}/list`, label: 'Subscribers' }, { to: `${base}/muted`, label: 'Muted' }]} />
      {tab === 'list' ? <SubscriberList show={show} /> : tab === 'muted' ? <MutedList show={show} /> : <Overview show={show} />}
    </>
  );
}

function Overview({ show }: { show: Show }) {
  const tz = browserTz();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const s = useLoad(() => api<Stats>(`/v1/studio/shows/${show.key}/subscribers/stats?days=${days}&tz=${encodeURIComponent(tz)}`), [show.key, days]);
  if (s.state === 'loading') return <Loading lines={6} />;
  if (s.state === 'error') return <div className="card"><Failed message={s.message} retry={s.retry} /></div>;
  const d = s.data;
  const known = d.platforms.ios + d.platforms.android;
  return (
    <>
      <section className="stats" aria-label="Subscribers">
        <StatCard label="Subscribers" value={num(d.total)} />
        <StatCard label={`New in ${days} days`} value={num(d.trend.reduce((a, x) => a + x.sub, 0))} />
        <StatCard label={`Left in ${days} days`} value={num(d.trend.reduce((a, x) => a + x.unsub, 0))} />
        <StatCard label="iPhone / Android" value={known ? `${Math.round((d.platforms.ios / known) * 100)}% / ${Math.round((d.platforms.android / known) * 100)}%` : '—'} note={d.platforms.unknown ? `${num(d.platforms.unknown)} without notifications, not counted` : undefined} />
      </section>
      <section className="card" aria-labelledby="st-h">
        <div className="card-head">
          <h2 id="st-h">Subscribes and unsubscribes</h2>
          <label className="sr-only" htmlFor="sd">Range</label>
          <select id="sd" className="select" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </div>
        <SubTrend points={d.trend} />
        {d.historySince ? <p className="chart-note">Exact from {shortDate(d.historySince)}; before that only each listener's latest change is known. Days in {tz}.</p> : null}
      </section>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="hr-h">
        <h2 id="hr-h">When your listeners listen</h2>
        {d.hours.every((h) => h === 0) ? <Empty title="No listens yet" /> : <HourBars hours={d.hours} />}
        <p className="chart-note">By the time each listen was recorded, in {tz} — a close guide, not the exact minute they pressed play.</p>
      </section>
    </>
  );
}

function SubscriberList({ show }: { show: Show }) {
  const [page, setPage] = useState(1);
  const [n, setN] = useState(0);
  const [who, setWho] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useLoad(() => api<{ total: number; page: number; pageSize: number; items: Sub[] }>(`/v1/studio/shows/${show.key}/subscribers?page=${page}`), [show.key, page, n]);
  const cols: Column<Sub>[] = [
    { key: 'name', label: 'Name', render: (s) => <>{s.displayName}{s.muted ? <> <span className="pill pill-warn">Muted</span></> : null}</> },
    { key: 'at', label: 'Subscribed', render: (s) => shortDate(s.subscribedAt) },
    { key: 'act', label: 'Action', numeric: true, render: (s) => (s.muted ? <span className="muted">—</span> : <button type="button" className="linkish" onClick={() => setWho(s)}>Mute</button>) },
  ];
  return (
    <section className="card">
      {error ? <p className="error" role="alert">{error}</p> : null}
      {list.state === 'loading' ? <Loading lines={6} /> : null}
      {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
      {list.state === 'ready' && list.data.total === 0 ? <Empty title="No subscribers yet">When someone subscribes in the app, they appear here.</Empty> : null}
      {list.state === 'ready' && list.data.total > 0 ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{num(list.data.total)} subscriber{list.data.total === 1 ? '' : 's'}</p>
          <Table caption="Subscribers" columns={cols} rows={list.data.items} rowKey={(s) => s.id} />
          <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
        </>
      ) : null}
      {who ? (
        <MuteDialog show={show} id={who.id} name={who.displayName} busy={busy} setBusy={setBusy}
          onDone={() => { setWho(null); setN((x) => x + 1); }} onError={setError} onCancel={() => setWho(null)} />
      ) : null}
    </section>
  );
}

/** M22 US10: the longest ban reason the server keeps (apps/api/src/routes/studio/bans.ts). */
export const BAN_REASON_MAX = 200;

/**
 * Mute (= ban from commenting) one listener. M22 US10: the host may type a reason, kept for the
 * host alone and shown on the Bans page; with a reason the ban route stores it
 * (`PUT …/bans/:id`), without one the mute route is used exactly as before.
 */
export function MuteDialog({ show, id, name, busy, setBusy, onDone, onError, onCancel }: {
  show: Show; id: string; name: string; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void; onError: (m: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const why = reason.trim();
  return (
    <ConfirmDialog
      title={`Mute ${name}?`}
      body="They can still listen, react and clip, but can no longer comment on your show. Nothing changes on other shows. You can unmute any time."
      confirm="Mute" busy={busy} onCancel={onCancel}
      onConfirm={() => {
        setBusy(true);
        const call = why
          ? api(`/v1/studio/shows/${show.key}/bans/${id}`, { method: 'PUT', body: { reason: why } })
          : api(`/v1/studio/shows/${show.key}/mutes/${id}`, { method: 'PUT' });
        call
          .then(onDone, (e: unknown) => { onError(e instanceof HttpError ? e.message : 'That did not work.'); onCancel(); })
          .finally(() => setBusy(false));
      }}
    >
      <div className="field">
        <label htmlFor={`ban-reason-${id}`}>Reason (optional)</label>
        <input id={`ban-reason-${id}`} value={reason} maxLength={BAN_REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder="Only you and your team see this" />
        <span className="muted num" style={{ fontSize: 13, textAlign: 'right' }}>{reason.length} / {BAN_REASON_MAX}</span>
      </div>
    </ConfirmDialog>
  );
}

function MutedList({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const list = useLoad(() => api<{ items: Muted[] }>(`/v1/studio/shows/${show.key}/mutes`), [show.key, n]);
  const unmute = (id: string) => {
    setError(null);
    api(`/v1/studio/shows/${show.key}/mutes/${id}`, { method: 'DELETE' }).then(() => setN((x) => x + 1), (e: unknown) => setError(e instanceof HttpError ? e.message : 'That did not work.'));
  };
  const cols: Column<Muted>[] = [
    { key: 'name', label: 'Name', render: (m) => m.displayName },
    { key: 'at', label: 'Muted', render: (m) => `${shortDate(m.mutedAt)}${m.mutedBy ? ` by ${m.mutedBy}` : ''}` },
    { key: 'act', label: 'Action', numeric: true, render: (m) => <button type="button" className="linkish" onClick={() => unmute(m.id)}>Unmute</button> },
  ];
  return (
    <section className="card">
      {error ? <p className="error" role="alert">{error}</p> : null}
      {list.state === 'loading' ? <Loading /> : null}
      {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
      {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="Nobody is muted" /> : null}
      {list.state === 'ready' && list.data.items.length > 0 ? <Table caption="Muted listeners" columns={cols} rows={list.data.items} rowKey={(m) => m.id} /> : null}
    </section>
  );
}
