// Admin page for the reports queue: dismiss, remove, hide or suspend.
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

type Kind = 'comment' | 'clip' | 'profile' | 'show' | 'episode' | 'transcript';
type Action = 'dismiss' | 'remove' | 'hide_show' | 'suspend' | 'unsuspend' | 'unhide_show';
type Item = { targetKind: Kind; targetId: string; count: number; latestAt: number; reasons: string[]; reporters: string[]; notes: string[]; snapshot: Record<string, unknown> | null; actions: Action[] };
type Closed = { id: string; targetKind: Kind; targetId: string; reason: string; reporterName: string | null; createdAt: string; closedAt: string | null; closeReason: string | null };
type Done = { id: string; action: Action; targetKind: Kind; targetId: string; actorName: string; at: string };

const ACTION_LABEL: Record<Action, string> = { dismiss: 'Dismiss', remove: 'Remove', hide_show: 'Hide the show', suspend: 'Suspend the author', unsuspend: 'Restore', unhide_show: 'Un-hide the show' };
const str = (s: Record<string, unknown> | null, k: string) => (s && typeof s[k] === 'string' ? (s[k] as string) : '');

/** What was reported, from the copy kept at report time (the target may have changed since). */
function Snapshot({ item }: { item: Item }) {
  const s = item.snapshot;
  switch (item.targetKind) {
    // M20 US3 (FR-010): a voice comment shows its recording and the text its author posted with it.
    case 'comment': return <><blockquote className="row-body">{str(s, 'body') || (str(s, 'voiceUrl') ? '(voice)' : '(empty)')}</blockquote>{str(s, 'voiceUrl') ? <><audio controls preload="none" src={str(s, 'voiceUrl')} /><div className="row-sub">Text of the voice: {str(s, 'voiceText') || '(no text)'}</div></> : null}{str(s, 'imageUrl') ? <img src={str(s, 'imageUrl')} alt="The reported comment's image" style={{ maxWidth: 320, maxHeight: 320 }} /> : null}<div className="row-sub">by {str(s, 'authorName') || '?'} on “{str(s, 'episodeTitle')}”</div></>;
    case 'clip': return <><blockquote className="row-body">{str(s, 'caption') || '(no caption)'}</blockquote><div className="row-sub">clip by {str(s, 'authorName') || '?'} on “{str(s, 'episodeTitle')}”</div></>;
    case 'profile': return <div className="row-body">Profile: {str(s, 'displayName') || item.targetId}</div>;
    case 'show': return <div className="row-body">Show: {str(s, 'showTitle') || item.targetId}</div>;
    // M21 US2: an episode, or a transcript line with the listener's correction.
    case 'episode': return <div className="row-body">Episode: {str(s, 'episodeTitle') || item.targetId} <span className="row-sub">of {str(s, 'showTitle') || '?'}</span></div>;
    case 'transcript': return <><div className="row-sub">Transcript line on “{str(s, 'episodeTitle')}”</div><blockquote className="row-body">{str(s, 'original') || '(empty)'}</blockquote><div className="row-sub">Should say: {str(s, 'suggested')}</div></>;
  }
}

/**
 * M15 T039 (FR-031): the reports queue — the same items and the same actions as `/mod`, through
 * the same `act()` on the server, so acting here closes the item there too.
 */
export function Reports() {
  const [state, setState] = useState<'open' | 'closed'>('open');
  const [n, setN] = useState(0);
  const data = useLoad(() => api<{ state: 'open' | 'closed'; items: (Item | Closed)[]; actions: Done[] }>(`/v1/admin/reports?state=${state}`), [state, n]);
  const [asking, setAsking] = useState<{ item: Item; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!asking) return;
    setBusy(true); setError(null);
    try { await api('/v1/admin/reports/act', { method: 'POST', body: { kind: asking.item.targetKind, id: asking.item.targetId, action: asking.action } }); setN((x) => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); setAsking(null); }
  };
  return (
    <>
      <PageHead title="Reports" sub="What listeners reported. The same queue as the old moderation page." />
      <div className="tabs" role="tablist" aria-label="Reports" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" className="tab" aria-selected={state === 'open'} onClick={() => setState('open')}>Open</button>
        <button type="button" role="tab" className="tab" aria-selected={state === 'closed'} onClick={() => setState('closed')}>Closed (90 days)</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="card" aria-label={state === 'open' ? 'Open reports' : 'Closed reports'}>
        {data.state === 'loading' ? <Loading /> : null}
        {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
        {data.state === 'ready' && data.data.items.length === 0 ? <Empty title={state === 'open' ? 'Nothing to review' : 'Nothing closed recently'} /> : null}
        {data.state === 'ready' && data.data.state === 'open' ? (
          <ul className="rows">
            {(data.data.items as Item[]).map((i) => (
              <li key={`${i.targetKind}:${i.targetId}`} style={{ flexWrap: 'wrap' }}>
                <div className="row-main" style={{ flex: 1 }}>
                  <div className="row-sub"><span className="pill pill-warn">{i.targetKind}</span> {i.count} report{i.count === 1 ? '' : 's'} · {i.reasons.join(', ')} · by {i.reporters.join(', ')}</div>
                  <Snapshot item={i} />
                  {i.notes.length > 0 ? <div className="row-sub">Notes: {i.notes.join(' / ')}</div> : null}
                </div>
                <div className="pick-actions">
                  {i.actions.map((a) => (
                    <button key={a} type="button" className={a === 'dismiss' ? 'btn btn-quiet' : 'btn'} disabled={busy} onClick={() => setAsking({ item: i, action: a })}>
                      {ACTION_LABEL[a]}<span className="sr-only"> — {i.targetKind} {i.targetId}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {data.state === 'ready' && data.data.state === 'closed' ? (
          <ul className="rows">
            {(data.data.items as Closed[]).map((c) => (
              <li key={c.id}>
                <div className="row-main"><div className="row-title">{c.targetKind} {c.targetId}</div><div className="row-sub">{c.reason} · reported by {c.reporterName ?? 'a deleted account'}</div></div>
                <span className="row-side">{c.closeReason ?? 'closed'}{c.closedAt ? ` · ${new Date(c.closedAt).toLocaleDateString('en')}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {data.state === 'ready' ? (
        <section className="card" style={{ marginTop: 16 }} aria-labelledby="ra-h">
          <h2 id="ra-h">Recent actions (here and on /mod)</h2>
          {data.data.actions.length === 0 ? <Empty title="None yet" /> : (
            <ul className="rows">
              {data.data.actions.map((a) => (
                <li key={a.id}><span><strong>{a.action}</strong> {a.targetKind} <code>{a.targetId}</code></span><span className="row-side">{a.actorName} · {new Date(a.at).toLocaleString('en')}</span></li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {asking ? (
        <ConfirmDialog title={`${ACTION_LABEL[asking.action]}?`} body="This closes every open report on this item, here and on /mod." confirm={ACTION_LABEL[asking.action]} busy={busy}
          onCancel={() => setAsking(null)} onConfirm={() => { void run(); }} />
      ) : null}
    </>
  );
}
