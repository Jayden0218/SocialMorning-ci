// Admin page for the phone's app settings: Discover tiles, categories, section titles, list sizes, rate prompt, search hints.
import { useState, type ReactNode } from 'react';
import { api } from '../../api';
import { PageHead } from '../../shell/Page';
import { Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, isChanged, move, Reorder } from './common';

type Key = 'shortcuts' | 'genres' | 'sectionTitles' | 'listSizes' | 'ratePrompt' | 'searchHints';
type Item = { key: Key; value: unknown; saved: boolean; version: number; updatedAt: string | null };
type Size = { label: string; def: number; min: number; max: number };
type Rate = { enabled: boolean; delayMs: number; reaskAfterDays: number | null; storeUrls: { ios?: string; android?: string } };
export type ConfigData = {
  items: Item[];
  shortcuts: { id: string; label: string }[];
  genres: { id: number; name: string }[];
  sectionTitles: string[];
  listSizes: Record<string, Size>;
};
type Row<I> = { id: I; label: string; hidden: boolean };

/** Saved rows first (in their order), then every row the save did not name, in the default order. */
export function mergeRows<I>(defaults: readonly I[], saved: readonly { id: I; label?: string; name?: string; hidden?: boolean }[]): Row<I>[] {
  const named = saved.filter((r) => defaults.includes(r.id));
  return [
    ...named.map((r) => ({ id: r.id, label: r.label ?? r.name ?? '', hidden: r.hidden === true })),
    ...defaults.filter((id) => !named.some((r) => r.id === id)).map((id) => ({ id, label: '', hidden: false })),
  ];
}

/** The rows as the server stores them: a label only when one was typed, `hidden` only when true. */
export function rowsValue<I>(rows: readonly Row<I>[], field: 'label' | 'name') {
  return rows.map((r) => ({ id: r.id, ...(r.label.trim() ? { [field]: r.label.trim() } : {}), ...(r.hidden ? { hidden: true } : {}) }));
}

/** One line per hint; blank lines dropped. */
export const hintLines = (s: string): string[] => s.split('\n').map((x) => x.trim()).filter(Boolean);

/**
 * M25 A7: the phone's settings that used to be fixed in the app. Each card saves one key on its
 * own; the phone picks it up on its next start (it keeps the last copy, and falls back to the
 * built-in defaults when the server cannot be reached). "Back to default" removes the saved value.
 */
export function AppSettings() {
  const [n, setN] = useState(0);
  const data = useLoad(() => api<ConfigData>('/v1/admin/config'), [n]);
  return (
    <>
      <PageHead title="App settings" sub="What the phone shows that used to be fixed. Phones pick changes up on their next start." />
      {data.state === 'loading' ? <section className="card"><Loading /></section> : null}
      {data.state === 'error' ? <section className="card"><Failed message={data.message} retry={data.retry} /></section> : null}
      {data.state === 'ready' ? <Cards key={n} data={data.data} reload={() => setN((x) => x + 1)} /> : null}
    </>
  );
}

function Cards({ data, reload }: { data: ConfigData; reload: () => void }) {
  const item = (k: Key) => data.items.find((i) => i.key === k) ?? { key: k, value: undefined, saved: false, version: 0, updatedAt: null };
  return (
    <>
      <RowsCard item={item('shortcuts')} reload={reload} title="Discover shortcut tiles" field="label"
        sub="The round tiles under the search box: order, label, hide." defaults={data.shortcuts.map((s) => ({ id: s.id, name: s.label }))} />
      <RowsCard item={item('genres')} reload={reload} title="Categories and first-open interests" field="name"
        sub="The category strip, the categories page and the interests a new listener picks from: rename, reorder, hide." defaults={data.genres} />
      <TitlesCard item={item('sectionTitles')} reload={reload} titles={data.sectionTitles} />
      <SizesCard item={item('listSizes')} reload={reload} sizes={data.listSizes} />
      <RateCard item={item('ratePrompt')} reload={reload} />
      <HintsCard item={item('searchHints')} reload={reload} />
    </>
  );
}

/** A card that saves one key: Save, Back to default, and what happened. */
function KeyCard({ item, reload, title, sub, value, children }: { item: Item; reload: () => void; title: string; sub: string; value: () => unknown; children: ReactNode }) {
  const [version, setVersion] = useState(item.version);
  const [saved, setSaved] = useState(item.saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const id = `cfg-${item.key}`;
  const run = async (f: () => Promise<void>, note: string) => {
    setBusy(true); setError(null); setDone(null);
    try { await f(); setDone(note); } catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const r = await api<{ version: number }>(`/v1/admin/config/${item.key}`, { method: 'PUT', body: { version, value: value() } });
    setVersion(r.version); setSaved(true);
  }, 'Saved. Phones pick it up on their next start.');
  const reset = () => run(async () => {
    await api(`/v1/admin/config/${item.key}?version=${version}`, { method: 'DELETE' });
    reload();
  }, 'Back to the default.');
  return (
    <section className="card" style={{ marginBottom: 16 }} aria-labelledby={id}>
      <h2 id={id}>{title} {saved ? <span className="pill">Changed</span> : <span className="pill">Default</span>}</h2>
      <p className="muted">{sub}</p>
      {children}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button type="button" className="btn" disabled={busy} onClick={() => { void save(); }}>{busy ? 'Saving…' : `Save ${title.toLowerCase()}`}</button>
        {saved ? <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void reset(); }}>Back to default</button> : null}
      </div>
      {done ? <p role="status">{done}</p> : null}
      {error ? <p className="error" role="alert">{error}{error === CHANGED_MESSAGE ? <> <button type="button" className="linkish" onClick={reload}>Reload</button></> : null}</p> : null}
    </section>
  );
}

function RowsCard<I extends string | number>({ item, reload, title, sub, field, defaults }: { item: Item; reload: () => void; title: string; sub: string; field: 'label' | 'name'; defaults: { id: I; name: string }[] }) {
  const ids = defaults.map((d) => d.id);
  const nameOf = (id: I) => defaults.find((d) => d.id === id)?.name ?? String(id);
  const [rows, setRows] = useState(() => mergeRows(ids, Array.isArray(item.value) ? (item.value as { id: I }[]) : []));
  const set = (i: number, patch: Partial<Row<I>>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <KeyCard item={item} reload={reload} title={title} sub={sub} value={() => rowsValue(rows, field)}>
      <ol className="rows section-list" aria-label={`${title} in order`}>
        {rows.map((r, i) => (
          <li key={String(r.id)}>
            <label className="switch">
              <input type="checkbox" checked={!r.hidden} onChange={(e) => set(i, { hidden: !e.target.checked })} />
              Show {nameOf(r.id)}
            </label>
            <input aria-label={`New name for ${nameOf(r.id)}`} placeholder={nameOf(r.id)} maxLength={field === 'label' ? 24 : 32} value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Reorder i={i} n={rows.length} name={nameOf(r.id)} onMove={(d) => setRows(move(rows, i, d))} />
          </li>
        ))}
      </ol>
    </KeyCard>
  );
}

function TitlesCard({ item, reload, titles }: { item: Item; reload: () => void; titles: string[] }) {
  const [map, setMap] = useState<Record<string, string>>(() => ({ ...((item.value as Record<string, string> | undefined) ?? {}) }));
  return (
    <KeyCard item={item} reload={reload} title="Discover section titles" sub="Leave a box empty to keep the title as it is."
      value={() => Object.fromEntries(Object.entries(map).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))}>
      <div style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
        {titles.map((t) => (
          <label key={t} style={{ display: 'grid', gap: 2 }}>
            <span>{t}</span>
            <input placeholder={t} maxLength={40} value={map[t] ?? ''} onChange={(e) => setMap({ ...map, [t]: e.target.value })} />
          </label>
        ))}
      </div>
    </KeyCard>
  );
}

function SizesCard({ item, reload, sizes }: { item: Item; reload: () => void; sizes: Record<string, Size> }) {
  const start = (item.value as Record<string, number> | undefined) ?? {};
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(sizes).map(([k, s]) => [k, String(start[k] ?? s.def)])));
  return (
    <KeyCard item={item} reload={reload} title="List sizes" sub="How many items a list shows."
      value={() => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)]))}>
      <div style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
        {Object.entries(sizes).map(([k, s]) => (
          <label key={k} style={{ display: 'grid', gap: 2 }}>
            <span>{s.label} ({s.min}–{s.max}, default {s.def})</span>
            <input type="number" min={s.min} max={s.max} step={1} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </label>
        ))}
      </div>
    </KeyCard>
  );
}

function RateCard({ item, reload }: { item: Item; reload: () => void }) {
  const v = (item.value as Rate | undefined) ?? { enabled: true, delayMs: 1500, reaskAfterDays: null, storeUrls: {} };
  const [enabled, setEnabled] = useState(v.enabled);
  const [delay, setDelay] = useState(String(v.delayMs / 1000));
  const [reask, setReask] = useState(v.reaskAfterDays === null ? '' : String(v.reaskAfterDays));
  const [ios, setIos] = useState(v.storeUrls.ios ?? '');
  const [android, setAndroid] = useState(v.storeUrls.android ?? '');
  return (
    <KeyCard item={item} reload={reload} title="Rate prompt" sub="The “Enjoying SocialNet?” sheet. By default it asks once and never again after any answer."
      value={() => ({
        enabled, delayMs: Math.round(Number(delay) * 1000), reaskAfterDays: reask.trim() ? Number(reask) : null,
        storeUrls: { ...(ios.trim() ? { ios: ios.trim() } : {}), ...(android.trim() ? { android: android.trim() } : {}) },
      })}>
      <div style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
        <label><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Ask listeners to rate the app</label>
        <label style={{ display: 'grid', gap: 2 }}><span>Seconds after the tabs appear</span>
          <input type="number" min={0} max={60} step={0.5} value={delay} onChange={(e) => setDelay(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 2 }}><span>Ask again after this many days (empty: never; never after “Rate us”)</span>
          <input type="number" min={1} max={365} step={1} value={reask} onChange={(e) => setReask(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 2 }}><span>App Store link (https://…)</span>
          <input type="url" maxLength={300} value={ios} onChange={(e) => setIos(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 2 }}><span>Google Play link (https://…)</span>
          <input type="url" maxLength={300} value={android} onChange={(e) => setAndroid(e.target.value)} /></label>
      </div>
    </KeyCard>
  );
}

function HintsCard({ item, reload }: { item: Item; reload: () => void }) {
  const [text, setText] = useState(() => (Array.isArray(item.value) ? (item.value as string[]).join('\n') : ''));
  return (
    <KeyCard item={item} reload={reload} title="Search hints" sub="Words the search box rotates through, and “Try searching”. Empty: the app uses the top shows, as before."
      value={() => hintLines(text)}>
      <label style={{ display: 'grid', gap: 2, maxWidth: 560 }}>
        <span>Hints, one per line (up to 10)</span>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </KeyCard>
  );
}
