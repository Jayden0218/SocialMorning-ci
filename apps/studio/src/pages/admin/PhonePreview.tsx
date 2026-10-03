// Shows a day's picks the way the phone app will draw them.
import { api } from '../../api';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';

type Pick = { key: string; why?: string; date?: string; episode: { title: string; showTitle: string; imageUrl?: string } };
type Preview = { date?: string; picks: Pick[]; stale: boolean };

/**
 * M15 T017 (FR-011): a day's picks drawn the way the app's PickCard draws them — artwork, title,
 * show, the quote in italics — from the same body the phone gets (`/v1/admin/preview/discover`).
 * `stamp` changes after a save, so the preview reloads.
 */
export function PhonePreview({ day, stamp }: { day: string; stamp: number }) {
  const p = useLoad(() => api<Preview>(`/v1/admin/preview/discover?day=${day}`), [day, stamp]);
  return (
    <section className="card phone" aria-labelledby="pp-h">
      <h2 id="pp-h">On the phone, {day}</h2>
      {p.state === 'loading' ? <Loading /> : null}
      {p.state === 'error' ? <Failed message={p.message} retry={p.retry} /> : null}
      {p.state === 'ready' ? (
        <>
          {p.data.date && p.data.date !== day ? <p className="muted">Nothing is set for this day, so the phone shows the picks of {p.data.date}.</p> : null}
          {p.data.picks.length === 0 ? <Empty title="No picks to show" /> : (
            <ol className="phone-picks" aria-label="Picks as the phone shows them">
              {p.data.picks.map((x) => (
                <li key={x.key} className="preview-card">
                  {x.episode.imageUrl ? <img src={x.episode.imageUrl} alt="" /> : <div className="ph" aria-hidden="true" />}
                  <div className="row-main">
                    <div className="row-title">{x.episode.title}</div>
                    <div className="row-sub">{x.episode.showTitle}</div>
                    {x.why ? <p className="quote">“{x.why}”</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}
    </section>
  );
}
