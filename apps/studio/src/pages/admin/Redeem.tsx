// Admin page for redeem codes: make codes that give PLUS days or a paid show for free, see their uses, switch one off.
import { useState } from 'react';
import { api } from '../../api';
import { num, shortDate } from '../../format';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { Table, type Column } from '../../shell/Table';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

export type RedeemCode = {
  code: string; kind: 'plus' | 'show'; days: number | null; feedUrl: string | null; showTitle: string | null;
  uses: number; maxUses: number; note: string; createdAt: string; expiresAt: string | null; disabled: boolean;
};
type List = { items: RedeemCode[]; paidShows: { feedUrl: string; title: string }[] };

/** "ABCDEFGHJKMN" → "ABCD-EFGH-JKMN": easier to read out; the phone takes it with or without dashes. */
export const grouped = (code: string): string => (code.match(/.{1,4}/g) ?? [code]).join('-');

export function grantText(c: Pick<RedeemCode, 'kind' | 'days' | 'showTitle' | 'feedUrl'>): string {
  return c.kind === 'plus' ? `PLUS, ${c.days ?? 0} day${c.days === 1 ? '' : 's'}` : `Series: ${c.showTitle ?? c.feedUrl ?? '—'}`;
}

export function stateText(c: Pick<RedeemCode, 'disabled' | 'expiresAt' | 'uses' | 'maxUses'>, now = Date.now()): string {
  if (c.disabled) return 'Off';
  if (c.expiresAt && Date.parse(c.expiresAt) <= now) return 'Expired';
  if (c.uses >= c.maxUses) return 'Used up';
  return 'Open';
}

/**
 * M24 US15 (spec 025, lane A3): redeem codes. A code is a free gift from the owner — PLUS for some
 * days, or one paid series — never a sale. Each account can use a code once; "Uses" lets one code
 * go to several people. Codes are shown in full here; hand them out yourself.
 */
export function Redeem() {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<List>('/v1/admin/redeem'), [n]);
  const [made, setMade] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disable = async (c: RedeemCode) => {
    setBusy(c.code); setError(null);
    try { await api(`/v1/admin/redeem/${encodeURIComponent(c.code)}/disable`, { method: 'POST', body: {} }); setN((x) => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  const cols: Column<RedeemCode>[] = [
    { key: 'code', label: 'Code', render: (c) => <code>{grouped(c.code)}</code> },
    { key: 'gives', label: 'Gives', render: (c) => grantText(c) },
    { key: 'uses', label: 'Uses', numeric: true, render: (c) => `${num(c.uses)} / ${num(c.maxUses)}` },
    { key: 'state', label: 'State', render: (c) => stateText(c) },
    { key: 'note', label: 'Note', render: (c) => c.note || '—' },
    { key: 'made', label: 'Made', render: (c) => shortDate(c.createdAt) },
    { key: 'act', label: 'Action', numeric: true, render: (c) => (c.disabled ? null : (
      <button type="button" className="linkish" disabled={busy === c.code} onClick={() => { void disable(c); }}>Switch off<span className="sr-only"> {grouped(c.code)}</span></button>
    )) },
  ];
  return (
    <>
      <PageHead title="Redeem codes" sub="Free PLUS days or a paid series, given by you. Nothing is sold here. Each account can use a code once." />
      <NewCodes shows={list.state === 'ready' ? list.data.paidShows : []} onMade={(codes) => { setMade(codes); setN((x) => x + 1); }} />
      {made ? (
        <section className="card" style={{ marginTop: 16 }} aria-labelledby="rc-made" role="status">
          <h2 id="rc-made">{made.length === 1 ? 'Your new code' : `Your ${made.length} new codes`}</h2>
          <ul className="rows" aria-label="New codes">
            {made.map((c) => <li key={c}><code>{grouped(c)}</code></li>)}
          </ul>
        </section>
      ) : null}
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="rc-list">
        <h2 id="rc-list">Codes</h2>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {list.state === 'loading' ? <Loading lines={3} label="Codes" /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="No codes yet">Make one above.</Empty> : null}
        {list.state === 'ready' && list.data.items.length > 0 ? <Table caption="Redeem codes, newest first" columns={cols} rows={list.data.items} rowKey={(c) => c.code} /> : null}
      </section>
    </>
  );
}

function NewCodes({ shows, onMade }: { shows: { feedUrl: string; title: string }[]; onMade: (codes: string[]) => void }) {
  const [kind, setKind] = useState<'plus' | 'show'>('plus');
  const [days, setDays] = useState(30);
  const [picked, setFeedUrl] = useState('');
  // The list loads after the form; until a series is picked, the first one is meant.
  const feedUrl = picked || (shows[0]?.feedUrl ?? '');
  const [count, setCount] = useState(1);
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState('');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = (kind === 'plus' ? days >= 1 && days <= 3650 : feedUrl !== '') && count >= 1 && count <= 100 && maxUses >= 1 && maxUses <= 10000;
  const make = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ codes: string[] }>('/v1/admin/redeem', { method: 'POST', body: {
        kind, ...(kind === 'plus' ? { days } : { feedUrl }), count, maxUses, note: note.trim(),
        ...(ends ? { expiresAt: new Date(`${ends}T23:59:59`).toISOString() } : {}),
      } });
      setNote(''); onMade(r.codes);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="rc-new">
      <h2 id="rc-new">New codes</h2>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>A code gives</legend>
        <label className="radio"><input type="radio" name="rc-kind" checked={kind === 'plus'} onChange={() => setKind('plus')} /> PLUS for some days</label>
        <label className="radio"><input type="radio" name="rc-kind" checked={kind === 'show'} onChange={() => setKind('show')} disabled={shows.length === 0} /> A paid series{shows.length === 0 ? ' (no paid series yet)' : ''}</label>
      </fieldset>
      {kind === 'plus' ? (
        <div className="field"><label htmlFor="rc-days">Days of PLUS</label><input id="rc-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} /></div>
      ) : (
        <div className="field"><label htmlFor="rc-show">Series</label>
          <select id="rc-show" className="select" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)}>
            {shows.map((s) => <option key={s.feedUrl} value={s.feedUrl}>{s.title}</option>)}
          </select>
        </div>
      )}
      <div className="field"><label htmlFor="rc-count">How many codes (1–100)</label><input id="rc-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
      <div className="field"><label htmlFor="rc-uses">People per code (1–10 000)</label><input id="rc-uses" type="number" min={1} max={10000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} /></div>
      <div className="field"><label htmlFor="rc-note">Note, only you see it ({note.trim().length} / 200)</label><input id="rc-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="field"><label htmlFor="rc-ends">Last day it works (optional)</label><input id="rc-ends" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
      <button type="button" className="btn" disabled={!ok || busy} onClick={() => { void make(); }}>{count === 1 ? 'Make code' : `Make ${count} codes`}</button>
    </section>
  );
}
