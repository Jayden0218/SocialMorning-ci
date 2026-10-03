// Admin page to create, edit, order and retire curated episode collections.
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useDirty } from '../../shell/Unsaved';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, Finder, isChanged, move, Reorder, utcDay } from './common';

type Source = 'admin' | 'file';
type IssueItem = { feedUrl: string; guid?: string; note: string; label?: string };
type Issue = { id: string; day: string; title: string; intro: string; items: IssueItem[]; version: number; retired: boolean; source: Source };
type ColItem = { feedUrl: string; guid?: string; why?: string; label?: string };
type Collection = { id: string; title: string; subtitle?: string; position: number; items: ColItem[]; version: number; retired: boolean; source: Source };

const ID = /^[a-z0-9][a-z0-9-]*$/;
const sourcePill = (s: Source, retired: boolean) => (
  <>{retired ? <span className="pill">Retired</span> : null} <span className={`pill${s === 'file' ? '' : ' pill-warn'}`}>{s === 'admin' ? 'Admin' : 'File'}</span></>
);
const itemLabel = (i: { feedUrl: string; guid?: string; label?: string }) => i.label ?? (i.guid ? `${i.feedUrl} · ${i.guid}` : `${i.feedUrl} · latest episode`);

/**
 * M15 T018 (FR-010, FR-012): curated issues and collections — create, edit, order, retire — with
 * the same version check as picks. Items saved here replace the file's by id; "Retire" hides one,
 * even one that lives only in the file.
 */
export function Curated() {
  const [tab, setTab] = useState<'issues' | 'collections'>('issues');
  return (
    <>
      <PageHead title="Curated" sub="Issues (an editor's note over episodes) and the collections on Discover." />
      <div className="tabs" role="tablist" aria-label="Kind" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'issues'} onClick={() => setTab('issues')}>Issues</button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'collections'} onClick={() => setTab('collections')}>Collections</button>
      </div>
      {tab === 'issues' ? <Issues /> : <Collections />}
    </>
  );
}

function Issues() {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: Issue[] }>('/v1/admin/issues'), [n]);
  const [editing, setEditing] = useState<Issue | 'new' | null>(null);
  return (
    <>
      <section className="card" aria-labelledby="iss-h">
        <div className="card-head">
          <h2 id="iss-h">Issues</h2>
          <button type="button" className="btn" onClick={() => setEditing('new')}>New issue</button>
        </div>
        {list.state === 'loading' ? <Loading /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="No issues yet" /> : null}
        {list.state === 'ready' ? (
          <ul className="rows">
            {list.data.items.map((i) => (
              <li key={i.id}>
                <div className="row-main">
                  <div className="row-title">{i.title}</div>
                  <div className="row-sub">{i.day} · {i.id} · {i.items.length} episode{i.items.length === 1 ? '' : 's'} {sourcePill(i.source, i.retired)}</div>
                </div>
                <button type="button" className="btn btn-quiet" onClick={() => setEditing(i)}>Edit<span className="sr-only"> {i.title}</span></button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {editing ? <IssueEditor key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`} issue={editing === 'new' ? null : editing} onDone={() => { setEditing(null); setN((x) => x + 1); }} /> : null}
    </>
  );
}

function IssueEditor({ issue, onDone }: { issue: Issue | null; onDone: () => void }) {
  const [id, setId] = useState(issue?.id ?? '');
  const [day, setDay] = useState(issue?.day ?? utcDay());
  const [title, setTitle] = useState(issue?.title ?? '');
  const [intro, setIntro] = useState(issue?.intro ?? '');
  const [items, setItems] = useState<IssueItem[]>(issue?.items ?? []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  useDirty(dirty);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const version = issue?.version ?? 0;
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/admin/issues/${id}`, { method: 'PUT', body: { version, day, title, intro, items: items.map(({ feedUrl, guid, note }) => ({ feedUrl, ...(guid ? { guid } : {}), note })) } });
      setDirty(false); onDone();
    } catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); }
  };
  const retire = async () => {
    setBusy(true); setError(null);
    try { await api(`/v1/admin/issues/${id}?version=${version}`, { method: 'DELETE' }); setDirty(false); onDone(); }
    catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); setRetiring(false); } finally { setBusy(false); }
  };
  const ok = ID.test(id) && id.length <= 64 && title.trim() && intro.trim() && items.every((i) => i.note.trim().length >= 1 && i.note.trim().length <= 280);
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="ie-h">
      <h2 id="ie-h">{issue ? `Edit “${issue.title}”` : 'New issue'}</h2>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}><label htmlFor="ie-id">Id (letters, digits, dashes)</label><input id="ie-id" className="select" maxLength={64} value={id} disabled={issue !== null} onChange={(e) => touch(setId)(e.target.value.toLowerCase())} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="ie-day">Out on</label><input id="ie-day" type="date" className="select" value={day} onChange={(e) => touch(setDay)(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="ie-title">Title ({title.trim().length} / 80)</label><input id="ie-title" maxLength={80} value={title} onChange={(e) => touch(setTitle)(e.target.value)} /></div>
      <div className="field"><label htmlFor="ie-intro">Intro ({intro.trim().length} / 600)</label><textarea id="ie-intro" className="textarea" rows={4} maxLength={600} value={intro} onChange={(e) => touch(setIntro)(e.target.value)} /></div>
      <ol className="rows" aria-label="Episodes in this issue">
        {items.map((it, i) => (
          <li key={`${it.feedUrl}|${it.guid ?? ''}|${i}`}>
            <div className="row-main" style={{ flex: 1 }}>
              <div className="row-title">{i + 1}. {itemLabel(it)}</div>
              <div className="field" style={{ margin: '6px 0 0' }}>
                <label htmlFor={`ie-n-${i}`}>Note ({it.note.trim().length} / 280)</label>
                <textarea id={`ie-n-${i}`} className="textarea" rows={2} maxLength={280} value={it.note} onChange={(e) => touch(setItems)(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              </div>
            </div>
            <div className="pick-actions">
              <Reorder i={i} n={items.length} name={itemLabel(it)} onMove={(d) => touch(setItems)(move(items, i, d))} />
              <button type="button" className="linkish" onClick={() => touch(setItems)(items.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <Finder label="Find an episode for this issue" onPick={(x) => { if ('guid' in x) touch(setItems)([...items, { feedUrl: x.feedUrl, guid: x.guid, note: '', label: `${x.title} — ${x.showTitle}` }]); }} />
      <div className="savebar" role="region" aria-label="Save issue">
        <span className="muted">{dirty ? 'You have unsaved changes.' : 'Nothing changed.'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-quiet" onClick={onDone} disabled={busy}>Close</button>
          {issue && !issue.retired ? <button type="button" className="btn btn-quiet" onClick={() => setRetiring(true)} disabled={busy}>Retire</button> : null}
          <button type="button" className="btn" onClick={() => { void save(); }} disabled={!dirty || busy || !ok}>{busy ? 'Saving…' : 'Save issue'}</button>
        </div>
      </div>
      {retiring ? <ConfirmDialog title="Retire this issue?" body="Listeners no longer see it. It stays in Activity." confirm="Retire" busy={busy} onCancel={() => setRetiring(false)} onConfirm={() => { void retire(); }} /> : null}
    </section>
  );
}

function Collections() {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: Collection[] }>('/v1/admin/collections'), [n]);
  const [editing, setEditing] = useState<Collection | 'new' | null>(null);
  return (
    <>
      <section className="card" aria-labelledby="col-h">
        <div className="card-head">
          <h2 id="col-h">Collections</h2>
          <button type="button" className="btn" onClick={() => setEditing('new')}>New collection</button>
        </div>
        <p className="muted">At most 6 are shown on Discover, lowest position first.</p>
        {list.state === 'loading' ? <Loading /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="No collections yet" /> : null}
        {list.state === 'ready' ? (
          <ul className="rows">
            {list.data.items.map((x) => (
              <li key={x.id}>
                <div className="row-main">
                  <div className="row-title">{x.title}</div>
                  <div className="row-sub">{x.id} · position {x.position} · {x.items.length} item{x.items.length === 1 ? '' : 's'} {sourcePill(x.source, x.retired)}</div>
                </div>
                <button type="button" className="btn btn-quiet" onClick={() => setEditing(x)}>Edit<span className="sr-only"> {x.title}</span></button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {editing ? <CollectionEditor key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`} col={editing === 'new' ? null : editing} onDone={() => { setEditing(null); setN((x) => x + 1); }} /> : null}
    </>
  );
}

function CollectionEditor({ col, onDone }: { col: Collection | null; onDone: () => void }) {
  const [id, setId] = useState(col?.id ?? '');
  const [title, setTitle] = useState(col?.title ?? '');
  const [subtitle, setSubtitle] = useState(col?.subtitle ?? '');
  const [position, setPosition] = useState(col && col.source === 'admin' ? col.position : 0);
  const [items, setItems] = useState<ColItem[]>(col?.items ?? []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  useDirty(dirty);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const version = col?.version ?? 0;
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/admin/collections/${id}`, { method: 'PUT', body: {
        version, title, ...(subtitle.trim() ? { subtitle } : {}), position,
        items: items.map(({ feedUrl, guid, why }) => ({ feedUrl, ...(guid ? { guid } : {}), ...(why?.trim() ? { why } : {}) })),
      } });
      setDirty(false); onDone();
    } catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); }
  };
  const retire = async () => {
    setBusy(true); setError(null);
    try { await api(`/v1/admin/collections/${id}?version=${version}`, { method: 'DELETE' }); setDirty(false); onDone(); }
    catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); setRetiring(false); } finally { setBusy(false); }
  };
  const ok = ID.test(id) && id.length <= 40 && title.trim() && items.length >= 1 && items.length <= 10;
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="ce-h">
      <h2 id="ce-h">{col ? `Edit “${col.title}”` : 'New collection'}</h2>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}><label htmlFor="ce-id">Id</label><input id="ce-id" className="select" maxLength={40} value={id} disabled={col !== null} onChange={(e) => touch(setId)(e.target.value.toLowerCase())} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="ce-pos">Position</label><input id="ce-pos" type="number" className="select" min={0} max={100} value={position} onChange={(e) => touch(setPosition)(Number(e.target.value) || 0)} /></div>
      </div>
      <div className="field"><label htmlFor="ce-title">Title ({title.trim().length} / 60)</label><input id="ce-title" maxLength={60} value={title} onChange={(e) => touch(setTitle)(e.target.value)} /></div>
      <div className="field"><label htmlFor="ce-sub">Subtitle, optional ({subtitle.trim().length} / 120)</label><input id="ce-sub" maxLength={120} value={subtitle} onChange={(e) => touch(setSubtitle)(e.target.value)} /></div>
      <ol className="rows" aria-label="Items in this collection">
        {items.map((it, i) => (
          <li key={`${it.feedUrl}|${it.guid ?? ''}|${i}`}>
            <div className="row-main" style={{ flex: 1 }}>
              <div className="row-title">{i + 1}. {itemLabel(it)}</div>
              <div className="field" style={{ margin: '6px 0 0' }}>
                <label htmlFor={`ce-w-${i}`}>Why, optional ({(it.why ?? '').trim().length} / 140)</label>
                <input id={`ce-w-${i}`} maxLength={140} value={it.why ?? ''} onChange={(e) => touch(setItems)(items.map((x, j) => (j === i ? { ...x, why: e.target.value } : x)))} />
              </div>
            </div>
            <div className="pick-actions">
              <Reorder i={i} n={items.length} name={itemLabel(it)} onMove={(d) => touch(setItems)(move(items, i, d))} />
              <button type="button" className="linkish" onClick={() => touch(setItems)(items.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      {items.length < 10 ? (
        <>
          <Finder label="Find an episode for this collection" onPick={(x) => { if ('guid' in x) touch(setItems)([...items, { feedUrl: x.feedUrl, guid: x.guid, label: `${x.title} — ${x.showTitle}` }]); }} />
          <Finder label="Or a show (its latest episode)" kind="show" onPick={(x) => touch(setItems)([...items, { feedUrl: x.feedUrl, label: `${x.title} — latest episode` }])} />
        </>
      ) : <p className="muted">10 items is the most for one collection.</p>}
      <div className="savebar" role="region" aria-label="Save collection">
        <span className="muted">{dirty ? 'You have unsaved changes.' : 'Nothing changed.'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-quiet" onClick={onDone} disabled={busy}>Close</button>
          {col && !col.retired ? <button type="button" className="btn btn-quiet" onClick={() => setRetiring(true)} disabled={busy}>Retire</button> : null}
          <button type="button" className="btn" onClick={() => { void save(); }} disabled={!dirty || busy || !ok}>{busy ? 'Saving…' : 'Save collection'}</button>
        </div>
      </div>
      {retiring ? <ConfirmDialog title="Retire this collection?" body="It leaves Discover. It stays in Activity." confirm="Retire" busy={busy} onCancel={() => setRetiring(false)} onConfirm={() => { void retire(); }} /> : null}
    </section>
  );
}
