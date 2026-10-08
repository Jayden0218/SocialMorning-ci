// Admin page for every list's pins and hides, the category page's default chip, and hiding a show or episode everywhere.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { Table, type Column } from '../../shell/Table';
import { useLoad } from '../../useLoad';
import { errorText, Finder, type EpisodeCard, type ShowCard } from './common';
import { HiddenEverywhere, HideEverywhere } from './hide';

type ItemKind = 'show' | 'episode' | 'comment';
type ListInfo = { id: string; label: string; item: ItemKind; pins: boolean; where: string };
type Override = { id: string; kind: 'pin' | 'hide'; feedUrl?: string; guid?: string; commentId?: string; position: number | null; startsAt: string | null; endsAt: string | null; note: string | null; createdAt: string; live: boolean };
type LiveRow = { feedUrl?: string; guid?: string; commentId?: string; title: string; sub: string; pinned: boolean };
type Detail = { list: ListInfo; overrides: Override[]; live: LiveRow[]; liveError?: string; defaultTab?: string | null };

const TABS = [{ value: 'forYou', label: 'For you' }, { value: 'all', label: 'Hot' }, { value: 'newest', label: 'Newest' }];
const path = (listId: string) => `/v1/admin/lists/${encodeURIComponent(listId)}`;
const itemLabel = (o: { feedUrl?: string; guid?: string; commentId?: string }, names: Map<string, string>) =>
  o.commentId ? `Comment ${o.commentId.slice(0, 8)}…` : `${names.get(`${o.feedUrl}|${o.guid ?? ''}`) ?? o.feedUrl}${o.guid ? ` · ${o.guid}` : ''}`;
/** A `datetime-local` value as an ISO time, or null when empty. */
const fromLocal = (v: string): string | null => (v ? new Date(v).toISOString() : null);

/**
 * M25 A1–A4 (lane AL): pick a list, see what a listener is served now, and pin (with a slot) or
 * hide shows, episodes or — on "What listeners said" — comments, each with optional start and end
 * times. Category pages also take a default chip. Below: shows and episodes hidden everywhere (A3).
 */
export function Lists() {
  const index = useLoad(() => api<{ lists: ListInfo[]; categories: { genreId: number; name: string; listId: string }[] }>('/v1/admin/lists'), []);
  const [listId, setListId] = useState('trending');
  return (
    <>
      <PageHead title="Lists" sub="Pin or hide anything on any list the app shows. Changes apply on the listener's next refresh." />
      <section className="card" aria-labelledby="ls-pick">
        <h2 id="ls-pick">Choose a list</h2>
        {index.state === 'loading' ? <Loading lines={1} label="Lists" /> : null}
        {index.state === 'error' ? <Failed message={index.message} retry={index.retry} /> : null}
        {index.state === 'ready' ? (
          <div className="field">
            <label htmlFor="ls-list">List</label>
            <select id="ls-list" className="select" value={listId} onChange={(e) => setListId(e.target.value)}>
              <optgroup label="Discover and charts">
                {index.data.lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </optgroup>
              <optgroup label="Category pages">
                {index.data.categories.map((c) => <option key={c.listId} value={c.listId}>Category › {c.name}</option>)}
              </optgroup>
            </select>
          </div>
        ) : null}
      </section>
      <OneList key={listId} listId={listId} />
      <HiddenEverywhere />
    </>
  );
}

function OneList({ listId }: { listId: string }) {
  const [n, setN] = useState(0);
  const d = useLoad(() => api<Detail>(path(listId)), [listId, n]);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const reload = () => setN((x) => x + 1);
  const run = (p: Promise<unknown>) => { setError(null); p.then(reload, (e: unknown) => setError(errorText(e))); };
  if (d.state === 'loading') return <section className="card"><Loading label="List" /></section>;
  if (d.state === 'error') return <section className="card"><Failed message={d.message} retry={d.retry} /></section>;
  const { list, overrides, live, liveError } = d.data;
  const add = (body: Record<string, unknown>) => run(api(path(listId), { method: 'POST', body }));
  const remove = (o: Override) => run(api(`${path(listId)}/${o.id}`, { method: 'DELETE' }));
  const ref = (r: LiveRow) => (r.commentId ? { commentId: r.commentId } : { feedUrl: r.feedUrl, ...(list.item === 'episode' && r.guid ? { guid: r.guid } : {}) });

  const liveCols: Column<LiveRow & { i: number }>[] = [
    { key: 'n', label: '#', numeric: true, render: (r) => r.i + 1 },
    { key: 'title', label: list.item === 'comment' ? 'Quote' : 'Title', render: (r) => <><div className="row-title">{r.title}{r.pinned ? <span className="muted"> · pinned</span> : null}</div><div className="row-sub">{r.sub}</div></> },
    { key: 'act', label: 'Action', numeric: true, render: (r) => (
      <span className="pick-actions">
        <button type="button" className="linkish" onClick={() => add({ kind: 'hide', ...ref(r) })}>Hide here<span className="sr-only"> {r.title}</span></button>
        {r.feedUrl && !r.commentId ? <HideEverywhere feedUrl={r.feedUrl} {...(list.item === 'episode' && r.guid ? { guid: r.guid } : {})} name={r.title} onDone={reload} /> : null}
      </span>
    ) },
  ];
  const rowCols: Column<Override>[] = [
    { key: 'kind', label: 'Kind', render: (o) => (o.kind === 'pin' ? `Pin${o.position ? ` · slot ${o.position}` : ''}` : 'Hide') },
    { key: 'item', label: 'Item', render: (o) => itemLabel(o, names) },
    { key: 'when', label: 'When', render: (o) => `${o.startsAt ? `from ${shortDate(o.startsAt)}` : 'now'}${o.endsAt ? ` until ${shortDate(o.endsAt)}` : ''}${o.live ? '' : ' (not live)'}` },
    { key: 'note', label: 'Note', render: (o) => o.note ?? '' },
    { key: 'act', label: 'Action', numeric: true, render: (o) => <button type="button" className="linkish" onClick={() => remove(o)}>Remove<span className="sr-only"> {itemLabel(o, names)}</span></button> },
  ];
  return (
    <>
      <section className="card" aria-labelledby="ls-live">
        <h2 id="ls-live">{list.label} — live now</h2>
        <p className="muted">{list.where}{list.pins ? '' : ' · this list takes hides only'}</p>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {liveError ? <p className="muted" role="status">Could not build the list now: {liveError}</p> : null}
        {live.length === 0 && !liveError ? <Empty title="Nothing on this list right now" /> : null}
        {live.length > 0 ? <Table caption={`${list.label} as served`} columns={liveCols} rows={live.map((r, i) => ({ ...r, i }))} rowKey={(r) => `${r.i}|${r.feedUrl ?? r.commentId}|${r.guid ?? ''}`} /> : null}
      </section>
      {d.data.defaultTab !== undefined ? <DefaultChip listId={listId} value={d.data.defaultTab ?? null} onSaved={reload} /> : null}
      <section className="card" aria-labelledby="ls-rows">
        <h2 id="ls-rows">Pins and hides on this list</h2>
        {overrides.length === 0 ? <p className="muted">None — the list as computed.</p> : <Table caption={`Pins and hides on ${list.label}`} columns={rowCols} rows={overrides} rowKey={(o) => o.id} />}
        <AddRow list={list} onAdd={(body, label) => {
          if (label && body['feedUrl']) setNames(new Map(names).set(`${String(body['feedUrl'])}|${String(body['guid'] ?? '')}`, label));
          add(body);
        }} />
      </section>
    </>
  );
}

function AddRow({ list, onAdd }: { list: ListInfo; onAdd: (body: Record<string, unknown>, label?: string) => void }) {
  const [kind, setKind] = useState<'pin' | 'hide'>(list.pins ? 'pin' : 'hide');
  const [item, setItem] = useState<{ feedUrl: string; guid?: string; label: string } | null>(null);
  const [comment, setComment] = useState('');
  const [position, setPosition] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const ready = list.item === 'comment' ? /^[0-9a-f-]{36}$/i.test(comment.trim()) : item !== null;
  const submit = () => {
    const what = list.item === 'comment' ? { commentId: comment.trim() } : { feedUrl: item!.feedUrl, ...(item!.guid ? { guid: item!.guid } : {}) };
    onAdd({
      kind, ...what,
      ...(kind === 'pin' && position ? { position: Number(position) } : {}),
      ...(startsAt ? { startsAt: fromLocal(startsAt) } : {}), ...(endsAt ? { endsAt: fromLocal(endsAt) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }, item?.label);
    setItem(null); setComment(''); setPosition(''); setStartsAt(''); setEndsAt(''); setNote('');
  };
  return (
    <div className="add-row">
      <h3>Add a pin or a hide</h3>
      <div className="field">
        <label htmlFor="ls-kind">Kind</label>
        <select id="ls-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as 'pin' | 'hide')}>
          {list.pins ? <option value="pin">Pin</option> : null}
          <option value="hide">Hide</option>
        </select>
      </div>
      {list.item === 'comment' ? (
        <div className="field"><label htmlFor="ls-comment">Comment id</label><input id="ls-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="From the live list above, or a report" /></div>
      ) : (
        <>
          {item ? <p>Chosen: <b>{item.label}</b> <button type="button" className="linkish" onClick={() => setItem(null)}>Change</button></p> : (
            <Finder label={list.item === 'show' ? 'Find a show' : 'Find an episode'} kind={list.item === 'show' ? 'show' : 'episode'} onPick={(x) => {
              if ('guid' in x) setItem({ feedUrl: x.feedUrl, guid: (x as EpisodeCard).guid, label: `${x.title} — ${(x as EpisodeCard).showTitle}` });
              else setItem({ feedUrl: x.feedUrl, label: (x as ShowCard).title });
            }} />
          )}
          {list.item === 'episode' && !item ? <p className="muted">To pin a show's newest episode or hide all of a show, choose any of its episodes, then "Use the whole show instead".</p> : null}
          {list.item === 'episode' && item?.guid ? <button type="button" className="linkish" onClick={() => setItem({ feedUrl: item.feedUrl, label: `${item.label} (whole show)` })}>Use the whole show instead</button> : null}
        </>
      )}
      {kind === 'pin' ? <div className="field"><label htmlFor="ls-pos">Slot (1 = first; empty = in the order added)</label><input id="ls-pos" type="number" min={1} max={200} value={position} onChange={(e) => setPosition(e.target.value)} /></div> : null}
      <div className="field"><label htmlFor="ls-start">Starts (optional)</label><input id="ls-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
      <div className="field"><label htmlFor="ls-end">Ends (optional)</label><input id="ls-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
      <div className="field"><label htmlFor="ls-note">Note (optional)</label><input id="ls-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></div>
      <button type="button" className="btn" disabled={!ready} onClick={submit}>{kind === 'pin' ? 'Pin' : 'Hide'}</button>
    </div>
  );
}

function DefaultChip({ listId, value, onSaved }: { listId: string; value: string | null; onSaved: () => void }) {
  const [tab, setTab] = useState(value ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const save = () => {
    setMsg(null);
    api(`${path(listId)}/default-tab`, { method: 'PUT', body: { tab: tab || null } }).then(() => { setMsg('Saved.'); onSaved(); }, (e: unknown) => setMsg(errorText(e)));
  };
  return (
    <section className="card" aria-labelledby="ls-chip">
      <h2 id="ls-chip">The chip this category opens on</h2>
      <div className="field">
        <label htmlFor="ls-tab">Default chip</label>
        <select id="ls-tab" className="select" value={tab} onChange={(e) => setTab(e.target.value)}>
          <option value="">The app's default (For you)</option>
          {TABS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {msg ? <p className="muted" role="status">{msg}</p> : null}
      <button type="button" className="btn" onClick={save}>Save default chip</button>
    </section>
  );
}
