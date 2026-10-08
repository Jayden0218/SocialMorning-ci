// Admin page for For You: boost, bury or never recommend a show; the ranking weights; the numbers per channel.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { pct, shortDate } from '../../format';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { Table, type Column } from '../../shell/Table';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, Finder, isChanged, type ShowCard } from './common';

type Rule = 'boost' | 'bury' | 'never';
type RuleRow = { feedUrl: string; rule: Rule; note: string | null; createdAt: string; title: string | null };
type Weights = Record<string, number>;
type State = { rules: RuleRow[]; weights: Weights; version: number; saved: boolean; defaults: Weights; bounds: Record<string, [number, number]>; boost: number; bury: number };
type Recs = { days: number; channels: { channel: string; shown: number; opened: number; played: number; finished: number }[]; similarityAge: number | null; similarityStale: boolean };

/** The weights in words, in rank.ts's order. */
export const WEIGHT_LABEL: Record<string, string> = {
  affinity: 'Fits what they like (follows, similar shows, categories)', social: 'People they follow engaged',
  freshness: 'New episodes', quality: 'Talked about here', fatigue: 'Shown before and not opened (taken off)',
};
const RULE_LABEL: Record<Rule, string> = { boost: 'Boost', bury: 'Bury', never: 'Never recommend' };

/** M25 A6 + A9 (lane AL): the For You controls, and /mod/recs' numbers in Admin. */
export function ForYouAdmin() {
  const [n, setN] = useState(0);
  const s = useLoad(() => api<State>('/v1/admin/foryou'), [n]);
  const recs = useLoad(() => api<Recs>('/v1/admin/recs'), []);
  const reload = () => setN((x) => x + 1);
  return (
    <>
      <PageHead title="For You" sub="Each listener's own list. Rules and weights apply to every list from the next refresh." />
      {s.state === 'loading' ? <section className="card"><Loading /></section> : null}
      {s.state === 'error' ? <section className="card"><Failed message={s.message} retry={s.retry} /></section> : null}
      {s.state === 'ready' ? <Rules state={s.data} onChanged={reload} /> : null}
      {s.state === 'ready' ? <WeightsForm state={s.data} onChanged={reload} /> : null}
      <section className="card" aria-labelledby="fy-recs">
        <h2 id="fy-recs">How it is doing — last 7 days</h2>
        {recs.state === 'loading' ? <Loading lines={3} label="Numbers" /> : null}
        {recs.state === 'error' ? <Failed message={recs.message} retry={recs.retry} /> : null}
        {recs.state === 'ready' ? <RecsTable recs={recs.data} /> : null}
      </section>
    </>
  );
}

function Rules({ state, onChanged }: { state: State; onChanged: () => void }) {
  const [show, setShow] = useState<{ feedUrl: string; title: string } | null>(null);
  const [rule, setRule] = useState<Rule>('boost');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<unknown>) => { setError(null); p.then(() => { setShow(null); setNote(''); onChanged(); }, (e: unknown) => setError(errorText(e))); };
  const cols: Column<RuleRow>[] = [
    { key: 'show', label: 'Show', render: (r) => r.title ?? r.feedUrl },
    { key: 'rule', label: 'Rule', render: (r) => RULE_LABEL[r.rule] },
    { key: 'note', label: 'Note', render: (r) => r.note ?? '' },
    { key: 'at', label: 'Set', render: (r) => shortDate(r.createdAt) },
    { key: 'act', label: 'Action', numeric: true, render: (r) => <button type="button" className="linkish" onClick={() => run(api(`/v1/admin/foryou/rules?feedUrl=${encodeURIComponent(r.feedUrl)}`, { method: 'DELETE' }))}>Remove<span className="sr-only"> rule on {r.title ?? r.feedUrl}</span></button> },
  ];
  return (
    <section className="card" aria-labelledby="fy-rules">
      <h2 id="fy-rules">Shows: boost, bury, never</h2>
      <p className="muted">Boost adds {state.boost} to each of the show's episodes' scores; bury takes {state.bury} off; never removes the show from every For You list.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {state.rules.length === 0 ? <Empty title="No rules — For You as computed" /> : <Table caption="For You rules" columns={cols} rows={state.rules} rowKey={(r) => r.feedUrl} />}
      {show ? (
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); run(api('/v1/admin/foryou/rules', { method: 'PUT', body: { feedUrl: show.feedUrl, rule, ...(note.trim() ? { note: note.trim() } : {}) } })); }}>
          <span className="row-main">{show.title}</span>
          <label className="sr-only" htmlFor="fy-rule">Rule</label>
          <select id="fy-rule" className="select" value={rule} onChange={(e) => setRule(e.target.value as Rule)}>
            {(Object.keys(RULE_LABEL) as Rule[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}
          </select>
          <label className="sr-only" htmlFor="fy-note">Note</label>
          <input id="fy-note" placeholder="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="btn">Save rule</button>
          <button type="button" className="linkish" onClick={() => setShow(null)}>Cancel</button>
        </form>
      ) : <Finder label="Find a show for a rule" kind="show" onPick={(x) => setShow({ feedUrl: x.feedUrl, title: (x as ShowCard).title })} />}
    </section>
  );
}

function WeightsForm({ state, onChanged }: { state: State; onChanged: () => void }) {
  const [w, setW] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setW(Object.fromEntries(Object.entries(state.weights).map(([k, v]) => [k, String(v)]))); }, [state]);
  const keys = Object.keys(state.defaults);
  const bad = keys.filter((k) => { const v = Number(w[k]); const [lo, hi] = state.bounds[k] ?? [0, 0]; return w[k] === '' || !Number.isFinite(v) || v < lo || v > hi; });
  const send = (weights: Weights | null) => {
    setMsg(null);
    api('/v1/admin/foryou/weights', { method: 'PUT', body: { version: state.version, weights } }).then(() => { setMsg('Saved.'); onChanged(); }, (e: unknown) => setMsg(isChanged(e) ? CHANGED_MESSAGE : errorText(e)));
  };
  return (
    <section className="card" aria-labelledby="fy-w">
      <h2 id="fy-w">Ranking weights</h2>
      <p className="muted">{state.saved ? 'Your saved weights.' : 'The built-in weights.'} Each must stay inside its range.</p>
      {keys.map((k) => {
        const [lo, hi] = state.bounds[k] ?? [0, 0];
        return (
          <div className="field" key={k}>
            <label htmlFor={`fy-w-${k}`}>{WEIGHT_LABEL[k] ?? k} ({lo}–{hi}, built-in {state.defaults[k]})</label>
            <input id={`fy-w-${k}`} type="number" step={0.05} min={lo} max={hi} value={w[k] ?? ''} aria-invalid={bad.includes(k)} onChange={(e) => setW({ ...w, [k]: e.target.value })} />
          </div>
        );
      })}
      {msg ? <p className="muted" role="status">{msg}</p> : null}
      <div className="toolbar">
        <button type="button" className="btn" disabled={bad.length > 0} onClick={() => send(Object.fromEntries(keys.map((k) => [k, Number(w[k])])))}>Save weights</button>
        <button type="button" className="btn btn-quiet" disabled={!state.saved} onClick={() => send(null)}>Reset to built-in</button>
      </div>
    </section>
  );
}

function RecsTable({ recs }: { recs: Recs }) {
  const cols: Column<Recs['channels'][number]>[] = [
    { key: 'channel', label: 'Channel', render: (r) => r.channel },
    { key: 'shown', label: 'Shown', numeric: true, render: (r) => r.shown },
    { key: 'opened', label: 'Opened', numeric: true, render: (r) => r.opened },
    { key: 'ctr', label: 'CTR', numeric: true, render: (r) => pct(r.shown === 0 ? null : r.opened / r.shown) },
    { key: 'played', label: 'Played', numeric: true, render: (r) => r.played },
    { key: 'finished', label: 'Finished', numeric: true, render: (r) => r.finished },
  ];
  return (
    <>
      <p className={recs.similarityStale ? 'error' : 'muted'}>
        Show similarity: {recs.similarityAge === null ? 'never rebuilt — the scheduled job has not run once.' : `${Math.round(recs.similarityAge)} h old${recs.similarityStale ? ' — the scheduled rebuild has stopped.' : '.'}`}
      </p>
      {recs.channels.length === 0 ? <Empty title="Nothing recorded yet" /> : <Table caption="For You per channel" columns={cols} rows={recs.channels} rowKey={(r) => r.channel} />}
      <p className="muted">Counts only — no listener is named.</p>
    </>
  );
}
