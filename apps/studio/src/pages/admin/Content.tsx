// Admin page to write the phone's Creator academy articles and Help questions, with a preview.
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, isChanged } from './common';
import { MarkdownView } from './Markdown';

type Kind = 'academy' | 'faq';
export type Page = { kind: Kind; slug: string; title: string; summary: string | null; tag: string | null; body: string; position: number; published: boolean; version: number; updatedAt: string };
type Draft = { slug: string; title: string; summary: string; tag: string; body: string; position: string; published: boolean; version: number };

const KINDS: { value: Kind; label: string }[] = [{ value: 'academy', label: 'Creator academy' }, { value: 'faq', label: 'Help questions' }];
const TABS: Record<string, string> = { start: 'Get started', grow: 'Grow', community: 'Community' };

/** A page title → an address: lower-case words joined by dashes, at most 64 characters. */
export const slugOf = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

const blank = (kind: Kind, position: number): Draft => ({ slug: '', title: '', summary: '', tag: kind === 'academy' ? 'start' : '', body: '', position: String(position), published: true, version: 0 });
const draftOf = (p: Page): Draft => ({ slug: p.slug, title: p.title, summary: p.summary ?? '', tag: p.tag ?? '', body: p.body, position: String(p.position), published: p.published, version: p.version });

/**
 * M25 A8: the phone's Academy articles and Help questions. The phone shows what is published here
 * and keeps its built-in copy for when the server cannot be reached. The body is a small Markdown
 * subset (## heading, - list, 1. list, **bold**, [words](https://…)); the preview draws it exactly
 * as the phone will — as text. HTML typed into a body is shown as text, never run.
 */
export function Content() {
  const [kind, setKind] = useState<Kind>('academy');
  const [n, setN] = useState(0);
  const data = useLoad(() => api<{ items: Page[] }>(`/v1/admin/content?kind=${kind}`), [kind, n]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = () => setN((x) => x + 1);
  const remove = async (p: Page) => {
    setBusy(true); setError(null);
    try { await api(`/v1/admin/content/${p.kind}/${p.slug}?version=${p.version}`, { method: 'DELETE' }); reload(); }
    catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); setDeleting(null); }
  };
  const items = data.state === 'ready' ? data.data.items : [];
  return (
    <>
      <PageHead title="Content" sub="The phone's Creator academy and Help questions. Only published pages show on phones." />
      <div className="tabs" role="tablist" aria-label="Which content" style={{ marginBottom: 12 }}>
        {KINDS.map((k) => (
          <button key={k.value} type="button" role="tab" className="tab" aria-selected={kind === k.value} onClick={() => { setKind(k.value); setDraft(null); }}>{k.label}</button>
        ))}
      </div>
      {draft ? <Editor kind={kind} draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); reload(); }} /> : (
        <section className="card" aria-labelledby="ct-h">
          <h2 id="ct-h">{kind === 'academy' ? 'Articles' : 'Questions'}</h2>
          <div className="toolbar"><button type="button" className="btn" onClick={() => setDraft(blank(kind, items.length))}>{kind === 'academy' ? 'New article' : 'New question'}</button></div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          {data.state === 'loading' ? <Loading /> : null}
          {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
          {data.state === 'ready' && items.length === 0 ? <Empty title="Nothing here yet" /> : null}
          {items.length > 0 ? (
            <ol className="rows" aria-label={kind === 'academy' ? 'Articles in order' : 'Questions in order'}>
              {items.map((p) => (
                <li key={p.slug}>
                  <div className="row-main" style={{ flex: 1 }}>
                    <div className="row-title">{p.title} {p.published ? null : <span className="pill">Not published</span>}</div>
                    <div className="row-sub">{[`#${p.position}`, p.tag ? (TABS[p.tag] ?? p.tag) : null, p.summary].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button type="button" className="btn btn-quiet" onClick={() => setDraft(draftOf(p))}>Edit<span className="sr-only"> {p.title}</span></button>
                  <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDeleting(p)}>Delete<span className="sr-only"> {p.title}</span></button>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      )}
      {deleting ? (
        <ConfirmDialog title={`Delete “${deleting.title}”?`} body="It leaves every phone on their next start. To hide it for a while, unpublish it instead."
          confirm="Delete" busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => { void remove(deleting); }} />
      ) : null}
    </>
  );
}

function Editor({ kind, draft, onClose, onSaved }: { kind: Kind; draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = draft.version === 0;
  const slug = isNew ? (d.slug || slugOf(d.title)) : d.slug;
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/admin/content/${kind}/${slug}`, { method: 'PUT', body: {
        version: d.version, title: d.title.trim(), summary: d.summary.trim() || null, tag: d.tag.trim() || null,
        body: d.body, position: Number(d.position) || 0, published: d.published,
      } });
      onSaved();
    } catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); }
  };
  const ok = d.title.trim() !== '' && d.body.trim() !== '' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
  return (
    <section className="card" aria-labelledby="ce-h">
      <h2 id="ce-h">{isNew ? (kind === 'academy' ? 'New article' : 'New question') : `Edit “${draft.title}”`}</h2>
      <div className="grid-2">
        <form style={{ display: 'grid', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (ok) void save(); }}>
          <label htmlFor="ce-title">{kind === 'academy' ? 'Title' : 'Question'}</label>
          <input id="ce-title" maxLength={120} required value={d.title} onChange={(e) => set({ title: e.target.value })} />
          <label htmlFor="ce-slug">Address (lower-case letters, digits, dashes)</label>
          <input id="ce-slug" maxLength={64} value={slug} disabled={!isNew} onChange={(e) => set({ slug: e.target.value })} />
          {kind === 'academy' ? (
            <>
              <label htmlFor="ce-summary">Card line</label>
              <input id="ce-summary" maxLength={200} value={d.summary} onChange={(e) => set({ summary: e.target.value })} />
              <label htmlFor="ce-tag">Tab</label>
              <select id="ce-tag" value={d.tag} onChange={(e) => set({ tag: e.target.value })}>
                {Object.entries(TABS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                <option value="">All only</option>
              </select>
            </>
          ) : (
            <>
              <label htmlFor="ce-tag">Chip (e.g. Listening)</label>
              <input id="ce-tag" maxLength={40} value={d.tag} onChange={(e) => set({ tag: e.target.value })} />
            </>
          )}
          <label htmlFor="ce-position">Place in the list (0 first)</label>
          <input id="ce-position" type="number" min={0} max={1000} value={d.position} onChange={(e) => set({ position: e.target.value })} />
          <label><input type="checkbox" checked={d.published} onChange={(e) => set({ published: e.target.checked })} /> Published</label>
          <label htmlFor="ce-body">{kind === 'academy' ? 'Article (## starts a section)' : 'Answer'}</label>
          <textarea id="ce-body" rows={14} maxLength={8000} value={d.body} onChange={(e) => set({ body: e.target.value })} />
          <p className="muted">## heading · - list · 1. list · **bold** · [words](https://…). HTML is shown as text.</p>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="toolbar">
            <button type="submit" className="btn" disabled={busy || !ok}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          </div>
        </form>
        <div>
          <h3>Preview</h3>
          <h4>{d.title || 'Untitled'}</h4>
          {kind === 'academy' && d.summary ? <p className="muted">{d.summary}</p> : null}
          <MarkdownView source={d.body} label="Preview of the body" />
        </div>
      </div>
    </section>
  );
}
