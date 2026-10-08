// Admin page for what listeners send in: feedback (with its pictures) and "Can't find it? Tell us" searches.
import { shortDate } from '../../format';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { Table, type Column } from '../../shell/Table';
import { useLoad } from '../../useLoad';
import { api } from '../../api';

type Feedback = { id: string; kind: string; body: string; appVersion: string | null; createdAt: string; displayName: string | null; images: number };
type Request = { q: string; n: number; last: string };

/**
 * M25 A9 (lane AL): /mod/feedback and /mod/search-requests, now in Admin (the /mod pages still
 * work). Pictures load through the Studio's own /api, so the Admin session cookie carries them.
 */
export function Inbox() {
  const fb = useLoad(() => api<{ items: Feedback[] }>('/v1/admin/feedback'), []);
  const sr = useLoad(() => api<{ items: Request[] }>('/v1/admin/search-requests'), []);
  const cols: Column<Request>[] = [
    { key: 'q', label: 'Search words', render: (r) => r.q },
    { key: 'n', label: 'Times', numeric: true, render: (r) => r.n },
    { key: 'last', label: 'Last asked', render: (r) => shortDate(r.last) },
  ];
  return (
    <>
      <PageHead title="Inbox" sub="What listeners send in. Words only on search requests — no listener is named." />
      <section className="card" aria-labelledby="ib-fb">
        <h2 id="ib-fb">Feedback — newest 50</h2>
        {fb.state === 'loading' ? <Loading lines={3} label="Feedback" /> : null}
        {fb.state === 'error' ? <Failed message={fb.message} retry={fb.retry} /> : null}
        {fb.state === 'ready' && fb.data.items.length === 0 ? <Empty title="No feedback yet" /> : null}
        {fb.state === 'ready' && fb.data.items.length > 0 ? (
          <ul className="rows" aria-label="Feedback">
            {fb.data.items.map((f) => (
              <li key={f.id}>
                <div className="row-main">
                  <div className="row-sub">{f.kind} · {shortDate(f.createdAt)} · {f.displayName ?? 'signed out'}{f.appVersion ? ` · ${f.appVersion}` : ''}</div>
                  <div className="row-title">{f.body}</div>
                  {f.images > 0 ? (
                    <div className="toolbar">
                      {Array.from({ length: f.images }, (_, k) => (
                        <a key={k} href={`/api/v1/admin/feedback/${f.id}/${k + 1}`} target="_blank" rel="noreferrer">
                          <img src={`/api/v1/admin/feedback/${f.id}/${k + 1}`} alt={`Picture ${k + 1} with this feedback`} className="feedback-pic" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="card" aria-labelledby="ib-sr">
        <h2 id="ib-sr">"Can't find it? Tell us" — last 90 days</h2>
        {sr.state === 'loading' ? <Loading lines={3} label="Search requests" /> : null}
        {sr.state === 'error' ? <Failed message={sr.message} retry={sr.retry} /> : null}
        {sr.state === 'ready' && sr.data.items.length === 0 ? <Empty title="Nothing asked yet" /> : null}
        {sr.state === 'ready' && sr.data.items.length > 0 ? <Table caption="Search requests" columns={cols} rows={sr.data.items} rowKey={(r) => r.q} /> : null}
      </section>
    </>
  );
}
