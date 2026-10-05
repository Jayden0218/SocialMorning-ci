// Page showing who subscribes: total, age ranges, genders and countries, groups under 10 hidden.
import { api, type Show } from '../api';
import { num } from '../format';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';

type Bucket = { key: string; count: number | '<10' };
type Demo = { total: number; age: Bucket[]; gender: Bucket[]; countries: Bucket[] };

const AGE_ORDER = ['under18', '18-24', '25-34', '35-44', '45-54', '55+'];
const AGE: Record<string, string> = { under18: 'Under 18', '18-24': '18–24', '25-34': '25–34', '35-44': '35–44', '45-54': '45–54', '55+': '55 and over' };
const GENDER: Record<string, string> = { woman: 'Woman', man: 'Man', another: 'Another gender', unsaid: 'Prefer not to say' };

const country = (code: string): string => {
  try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
};
const shown = (c: Bucket['count']) => (c === '<10' ? 'fewer than 10' : num(c));

/** M19 US12 (FR-073): totals only, never a group under 10, nothing that identifies a listener. */
export function Demographics({ show }: { show: Show }) {
  const d = useLoad(() => api<Demo>(`/v1/studio/shows/${show.key}/demographics`), [show.key]);
  return (
    <>
      <PageHead title="Demographics" sub="Who subscribes to your show, in groups." />
      <p className="muted" style={{ marginTop: 0 }}>Only listeners who chose to share their age range or gender are counted. Groups under 10 are not shown.</p>
      {d.state === 'loading' ? <Loading lines={6} label="Demographics" /> : null}
      {d.state === 'error' ? <div className="card"><Failed message={d.message} retry={d.retry} /></div> : null}
      {d.state === 'ready' ? (
        <>
          <section className="stats" aria-label="Subscribers">
            <StatCard label="Subscribers" value={num(d.data.total)} />
          </section>
          <div className="grid-2" style={{ marginTop: 0 }}>
            <section className="card" aria-labelledby="age-h">
              <h2 id="age-h">Age range</h2>
              <Bars items={[...d.data.age].sort((a, b) => AGE_ORDER.indexOf(a.key) - AGE_ORDER.indexOf(b.key))} label={(k) => AGE[k] ?? k} empty="No subscriber has shared an age range yet." />
            </section>
            <section className="card" aria-labelledby="gender-h">
              <h2 id="gender-h">Gender</h2>
              <Bars items={d.data.gender} label={(k) => GENDER[k] ?? k} empty="No subscriber has shared a gender yet." />
            </section>
          </div>
          <section className="card" style={{ marginTop: 16 }} aria-labelledby="country-h">
            <h2 id="country-h">Countries</h2>
            <Bars items={d.data.countries} label={country} empty="No countries to show yet." />
          </section>
        </>
      ) : null}
    </>
  );
}

/** A share bar for each group; a '<10' group gets no bar, only the words "fewer than 10". */
function Bars({ items, label, empty }: { items: Bucket[]; label: (key: string) => string; empty: string }) {
  if (items.length === 0) return <Empty title={empty} />;
  const max = Math.max(1, ...items.map((b) => (b.count === '<10' ? 0 : b.count)));
  return (
    <div className="bars">
      {items.map((b) => (
        <div key={b.key} className="bar-row">
          <span>{label(b.key)}</span><span className="num muted">{shown(b.count)}</span>
          <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${b.count === '<10' ? 0 : (b.count / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
