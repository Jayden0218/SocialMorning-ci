import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { Table, type Column } from '../shell/Table';
import { mb } from '../upload';
import { useLoad } from '../useLoad';

type File = { url: string; pathname: string; size: number; uploadedAt?: string; kind: 'audio' | 'image'; usedBy: string | null };
type Media = { files: File[]; usedBytes: number; ceilingBytes: number; totalUsedBytes: number };

/** M14 US5 (FR-06) — every file this show stored; a file in use cannot be deleted. Shows made here only. */
export function Media({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const m = useLoad(() => api<Media>(`/v1/studio/shows/${show.key}/media`), [show.key, n]);
  const [del, setDel] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!show.hosted) {
    return <><PageHead title="Media" /><div className="card"><Empty title="Your files live with your feed">This show comes from your own feed, so its audio and images are stored where you host it.</Empty></div></>;
  }
  const remove = async (f: File) => {
    setBusy(true); setError(null);
    try { await api(`/v1/studio/shows/${show.key}/media`, { method: 'DELETE', body: { url: f.url } }); setN((x) => x + 1); }
    catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); setDel(null); }
  };
  const cols: Column<File>[] = [
    { key: 'file', label: 'File', render: (f) => (
      <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
        {f.kind === 'image' ? <img src={f.url} alt="" width={36} height={36} style={{ borderRadius: 6, objectFit: 'cover' }} /> : null}
        <a href={f.url} target="_blank" rel="noreferrer">{f.pathname.split('/').at(-1)}</a>
      </span>
    ) },
    { key: 'kind', label: 'Type', render: (f) => (f.kind === 'audio' ? 'Audio' : 'Image') },
    { key: 'size', label: 'Size', numeric: true, render: (f) => mb(f.size) },
    { key: 'at', label: 'Uploaded', numeric: true, render: (f) => (f.uploadedAt ? shortDate(f.uploadedAt) : '—') },
    { key: 'used', label: 'Used by', render: (f) => f.usedBy ?? <span className="muted">Not used</span> },
    { key: 'del', label: 'Actions', render: (f) => (f.usedBy
      ? <span className="muted" title="Delete or change what uses it first">In use</span>
      : <button type="button" className="linkish" onClick={() => setDel(f)}>Delete<span className="sr-only"> {f.pathname.split('/').at(-1)}</span></button>) },
  ];
  return (
    <>
      <PageHead title="Media" sub="The audio and images you uploaded for this show." />
      {m.state === 'loading' ? <Loading lines={5} /> : null}
      {m.state === 'error' ? <div className="card"><Failed message={m.message} retry={m.retry} /></div> : null}
      {m.state === 'ready' ? (
        <>
          <section className="card" aria-labelledby="st-h" style={{ marginBottom: 16 }}>
            <h2 id="st-h">Storage</h2>
            <p className="num" style={{ margin: '0 0 8px' }}>This show: {mb(m.data.usedBytes)} · all shows made here: {mb(m.data.totalUsedBytes)} of {mb(m.data.ceilingBytes)}</p>
            <div className="bar-track" role="img" aria-label={`${Math.round((m.data.totalUsedBytes / m.data.ceilingBytes) * 100)} % of storage used`}>
              <div className="bar-fill" style={{ width: `${Math.min(100, (m.data.totalUsedBytes / m.data.ceilingBytes) * 100)}%` }} />
            </div>
          </section>
          <section className="card">
            {error ? <p className="error" role="alert">{error}</p> : null}
            {m.data.files.length === 0
              ? <Empty title="No files yet">Files appear here when you upload an episode or a cover.</Empty>
              : <Table caption="Files" columns={cols} rows={m.data.files} rowKey={(f) => f.url} />}
          </section>
        </>
      ) : null}
      {del ? <ConfirmDialog title="Delete this file?" body="It is removed from storage for good." confirm="Delete" busy={busy} onCancel={() => setDel(null)} onConfirm={() => { void remove(del); }} /> : null}
    </>
  );
}
