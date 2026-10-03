// Admin dashboard with app-wide numbers and charts over a chosen date range.
import { useState, type ReactNode } from 'react';
import { api } from '../../api';
import { TrendChart, type Point } from '../../charts/TrendChart';
import { num, pct } from '../../format';
import { PageHead } from '../../shell/Page';
import { StatCard } from '../../shell/StatCard';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';

type Range = 7 | 30 | 90;
type Sec<T> = ({ ok: true } & T) | { ok: false; message: string };
type Top = { title: string; hours: number };
export type Metrics = {
  days: Range; from: string; to: string; countedAt: string; partial: boolean;
  sections: {
    users: Sec<{ total: number; suspended: number; active: { d1: number; d7: number; d30: number }; newPerDay: Point[]; dauPerDay: Point[]; recordedSince: string | null }>;
    listening: Sec<{ listenersPerDay: Point[]; hoursPerDay: Point[]; finished: number; topShows: (Top & { feedUrl: string })[]; topEpisodes: (Top & { episodeId: string; showTitle: string })[] }>;
    library: Sec<{ addedPerDay: Point[]; removedPerDay: Point[]; topShows: { feedUrl: string; title: string; subscribers: number }[] }>;
    social: Sec<{ commentsPerDay: Point[]; reactionsPerDay: Point[]; clipsPerDay: Point[]; followsPerDay: Point[]; sharesPerDay: Point[]; voicePostsLive: number }>;
    recs: Sec<{ byChannel: { channel: string; shown: number; played: number }[] }>;
    safety: Sec<{ openReports: number; reports: number; actions: number; blocks: number }>;
    money: Sec<{ activePurchases: number; purchases: number; tips: number; amounts: { currency: string; micros: number }[] }>;
    creators: Sec<{ claimedShows: number; hostedShows: number; hostedEpisodes: number; teamMembers: number }>;
  };
};

const sum = (s: Point[]) => s.reduce((a, p) => a + p.value, 0);
const last = (s: Point[]) => s[s.length - 1]?.value ?? 0;
const hours = (h: number) => `${num(Math.round(h * 10) / 10)} h`;
const at = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
const CHANNEL: Record<string, string> = { 'sub-new': 'New from subscriptions', showcf: 'Similar shows', social: 'Friends', genre: 'Category', talked: 'Talked about', pick: 'Picks', chart: 'Chart' };

/** A section card: its title, then its body, or "could not load" with Retry — the others still show (FR-017). */
function Block<T>({ id, title, sec, retry, children }: { id: string; title: string; sec: Sec<T>; retry: () => void; children: (d: T) => ReactNode }) {
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {sec.ok ? children(sec as T) : <Failed message={sec.message} retry={retry} />}
    </section>
  );
}

/** One chart with a tab per series. */
function Series({ id, series, note }: { id: string; series: { key: string; label: string; points: Point[] }[]; note?: string }) {
  const [k, setK] = useState(series[0]!.key);
  const s = series.find((x) => x.key === k) ?? series[0]!;
  return (
    <>
      {series.length > 1 ? (
        <div className="tabs" role="tablist" aria-label="Measure" style={{ marginBottom: 12 }}>
          {series.map((x) => <button key={x.key} id={`${id}-${x.key}`} type="button" role="tab" className="tab" aria-selected={x.key === s.key} onClick={() => setK(x.key)}>{x.label}</button>)}
        </div>
      ) : null}
      <TrendChart points={s.points} label={s.label} />
      {note ? <p className="chart-note">{note}</p> : null}
    </>
  );
}

function Numbers({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <section className="stats" aria-label={label} style={{ marginBottom: 12 }}>
      {items.map(([l, v]) => <StatCard key={l} label={l} value={v} />)}
    </section>
  );
}

function Ranked({ label, rows, empty }: { label: string; rows: { key: string; title: string; sub?: string; value: number; shown: string }[]; empty: string }) {
  if (rows.length === 0) return <Empty title={empty} />;
  const max = rows[0]!.value || 1;
  return (
    <div className="bars" aria-label={label}>
      {rows.map((r) => (
        <div key={r.key} className="bar-row">
          <span className="row-title">{r.title}{r.sub ? <span className="row-sub"> · {r.sub}</span> : null}</span>
          <span className="num muted">{r.shown}</span>
          <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** M18 (specs/019-m18-admin-dashboard): every number the app holds, for the owner — counts over many people, never one. */
export function Dashboard() {
  const [days, setDays] = useState<Range>(30);
  const m = useLoad(() => api<Metrics>(`/v1/admin/metrics?days=${days}`), [days]);
  const d = m.state === 'ready' ? m.data : null;
  const s = d?.sections;
  const u = s?.users.ok ? s.users : null;
  const l = s?.listening.ok ? s.listening : null;
  const so = s?.social.ok ? s.social : null;
  const rangeLabel = `${days} days`;

  return (
    <>
      <PageHead
        title="Dashboard"
        sub={d ? `${d.from} to ${d.to} (Malaysia days) · counted at ${at(d.countedAt)}, refreshed every 5 minutes` : 'How the app is doing. Counts over everyone — no single person is shown.'}
        action={(
          <>
            <label className="sr-only" htmlFor="dash-range">Range</label>
            <select id="dash-range" className="select" value={days} onChange={(e) => setDays(Number(e.target.value) as Range)}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
          </>
        )}
      />
      {m.state === 'loading' ? <div className="card"><Loading lines={6} label="Dashboard" /></div> : null}
      {m.state === 'error' ? <div className="card"><Failed message={m.message} retry={m.retry} /></div> : null}
      {d && s ? (
        <>
          <section className="stats" aria-label="Headline">
            <StatCard label="Accounts" value={u ? num(u.total) : '—'} />
            <StatCard label={`New in ${rangeLabel}`} value={u ? num(sum(u.newPerDay)) : '—'} spark={u?.newPerDay.map((p) => p.value)} />
            <StatCard label="Used the app today" value={u ? num(last(u.dauPerDay)) : '—'} spark={u?.dauPerDay.map((p) => p.value)} />
            <StatCard label="Listened today" value={l ? num(last(l.listenersPerDay)) : '—'} spark={l?.listenersPerDay.map((p) => p.value)} />
            <StatCard label={`Hours listened, ${rangeLabel}`} value={l ? hours(sum(l.hoursPerDay)) : '—'} spark={l?.hoursPerDay.map((p) => p.value)} />
            <StatCard label={`Comments, ${rangeLabel}`} value={so ? num(sum(so.commentsPerDay)) : '—'} spark={so?.commentsPerDay.map((p) => p.value)} />
          </section>

          <Block id="users" title="Users" sec={s.users} retry={m.retry}>
            {(x) => (
              <>
                <Numbers label="Users now" items={[['Accounts', num(x.total)], ['Active, last 24 h', num(x.active.d1)], ['Active, last 7 days', num(x.active.d7)], ['Active, last 30 days', num(x.active.d30)], ['Suspended', num(x.suspended)]]} />
                <Series id="users" series={[{ key: 'dau', label: 'Used the app', points: x.dauPerDay }, { key: 'new', label: 'New accounts', points: x.newPerDay }]}
                  note={x.recordedSince ? `App use is recorded from ${x.recordedSince}; days before that show 0 because they were not recorded. "Active" counts signed-in phones by when they were last seen.` : 'App use has not been recorded yet: it starts the first time someone opens the app after this release.'} />
              </>
            )}
          </Block>

          <Block id="listening" title="Listening" sec={s.listening} retry={m.retry}>
            {(x) => (
              <>
                <Numbers label="Listening in range" items={[['Hours listened', hours(sum(x.hoursPerDay))], ['Episodes finished', num(x.finished)]]} />
                <Series id="listening" series={[{ key: 'people', label: 'Listeners', points: x.listenersPerDay }, { key: 'hours', label: 'Hours', points: x.hoursPerDay }]} note="Days are the listener's own phone day. Offline listening arrives when the phone next syncs." />
                <div className="grid-2" style={{ marginTop: 16 }}>
                  <div><h3>Top shows</h3><Ranked label="Top shows by hours" empty="No listening yet" rows={x.topShows.map((t) => ({ key: t.feedUrl, title: t.title, value: t.hours, shown: hours(t.hours) }))} /></div>
                  <div><h3>Top episodes</h3><Ranked label="Top episodes by hours" empty="No listening yet" rows={x.topEpisodes.map((t) => ({ key: t.episodeId, title: t.title, sub: t.showTitle, value: t.hours, shown: hours(t.hours) }))} /></div>
                </div>
              </>
            )}
          </Block>

          <Block id="library" title="Library" sec={s.library} retry={m.retry}>
            {(x) => (
              <>
                <Numbers label="Subscriptions in range" items={[['Subscribed', num(sum(x.addedPerDay))], ['Unsubscribed', num(sum(x.removedPerDay))]]} />
                <Series id="library" series={[{ key: 'add', label: 'Subscribed', points: x.addedPerDay }, { key: 'remove', label: 'Unsubscribed', points: x.removedPerDay }]} />
                <h3 style={{ marginTop: 16 }}>Most subscribed shows</h3>
                <Ranked label="Most subscribed shows" empty="No subscriptions yet" rows={x.topShows.map((t) => ({ key: t.feedUrl, title: t.title, value: t.subscribers, shown: num(t.subscribers) }))} />
              </>
            )}
          </Block>

          <Block id="social" title="Social" sec={s.social} retry={m.retry}>
            {(x) => (
              <>
                <Numbers label="Social in range" items={[['Comments', num(sum(x.commentsPerDay))], ['Reactions', num(sum(x.reactionsPerDay))], ['Clips', num(sum(x.clipsPerDay))], ['Follows', num(sum(x.followsPerDay))], ['Shares', num(sum(x.sharesPerDay))], ['Voice posts (last 48 h)', num(x.voicePostsLive)]]} />
                <Series id="social" series={[
                  { key: 'comments', label: 'Comments', points: x.commentsPerDay }, { key: 'reactions', label: 'Reactions', points: x.reactionsPerDay },
                  { key: 'clips', label: 'Clips', points: x.clipsPerDay }, { key: 'follows', label: 'Follows', points: x.followsPerDay }, { key: 'shares', label: 'Shares', points: x.sharesPerDay },
                ]} note="Voice posts are deleted after 48 hours, so only the live ones can be counted." />
              </>
            )}
          </Block>

          <div className="grid-2">
            <Block id="recs" title="For You" sec={s.recs} retry={m.retry}>
              {(x) => x.byChannel.length === 0 ? <Empty title="Nothing recommended in this range" /> : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">For You items shown and played, by source</caption>
                    <thead><tr><th scope="col">Source</th><th scope="col" className="num">Shown</th><th scope="col" className="num">Played</th><th scope="col" className="num">Rate</th></tr></thead>
                    <tbody>
                      {x.byChannel.map((c) => (
                        <tr key={c.channel}><td>{CHANNEL[c.channel] ?? c.channel}</td><td className="num">{num(c.shown)}</td><td className="num">{num(c.played)}</td><td className="num">{pct(c.shown > 0 ? c.played / c.shown : null)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Block>
            <Block id="safety" title="Safety" sec={s.safety} retry={m.retry}>
              {(x) => <Numbers label="Safety numbers" items={[['Open reports now', num(x.openReports)], ['Reports in range', num(x.reports)], ['Moderation actions', num(x.actions)], ['Blocks', num(x.blocks)]]} />}
            </Block>
            <Block id="money" title="Money" sec={s.money} retry={m.retry}>
              {(x) => (
                <>
                  <Numbers label="Money numbers" items={[['Active purchases now', num(x.activePurchases)], ['Purchases in range', num(x.purchases)], ['Tips in range', num(x.tips)]]} />
                  <p className="chart-note">{x.amounts.length === 0 ? 'No amounts reported by the stores in this range.' : x.amounts.map((a) => `${a.currency} ${(a.micros / 1e6).toFixed(2)}`).join(' · ')}</p>
                </>
              )}
            </Block>
            <Block id="creators" title="Creators" sec={s.creators} retry={m.retry}>
              {(x) => <Numbers label="Creator numbers" items={[['Claimed shows', num(x.claimedShows)], ['Shows hosted here', num(x.hostedShows)], ['Hosted episodes', num(x.hostedEpisodes)], ['Show team members', num(x.teamMembers)]]} />}
            </Block>
          </div>
        </>
      ) : null}
    </>
  );
}
