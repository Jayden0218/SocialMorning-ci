// Page listing the listeners banned from commenting on a show, with the reason kept and a button to lift each ban.
import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';

export type Ban = { listenerId: string; name: string; reason: string | null; createdAt: string };

/**
 * M22 US10 (FR-031): "Banned listeners". A ban is the show's comment mute (Comments › Mute, or
 * the app's "Ban from commenting"): the listener can't comment, reply or send a voice comment on
 * any episode of this show and is told so when they try — never by a push. Old comments stay.
 * The reason is the host's own note; listeners never see it.
 */
export function Bans({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useLoad(() => api<{ items: Ban[] }>(`/v1/studio/shows/${show.key}/bans`), [show.key, n]);
  const lift = (b: Ban) => {
    setError(null); setBusy(b.listenerId);
    api(`/v1/studio/shows/${show.key}/bans/${b.listenerId}`, { method: 'DELETE' })
      .then(() => setN((x) => x + 1), (e: unknown) => setError(e instanceof HttpError ? e.message : 'That did not work. Try again.'))
      .finally(() => setBusy(null));
  };
  const cols: Column<Ban>[] = [
    { key: 'name', label: 'Name', render: (b) => b.name },
    { key: 'reason', label: 'Reason', render: (b) => b.reason ?? <span className="muted">No reason noted</span> },
    { key: 'at', label: 'Banned', render: (b) => shortDate(b.createdAt) },
    {
      key: 'act', label: 'Action', numeric: true,
      render: (b) => (
        <button type="button" className="linkish" disabled={busy === b.listenerId} onClick={() => lift(b)}>
          Lift ban<span className="sr-only"> for {b.name}</span>
        </button>
      ),
    },
  ];
  return (
    <>
      <PageHead title="Banned listeners" sub="They can still listen, but can't comment on any episode of your show. Lift a ban any time." />
      <section className="card">
        {error ? <p className="error" role="alert">{error}</p> : null}
        {list.state === 'loading' ? <Loading lines={3} label="Banned listeners" /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="Nobody is banned">When you mute someone from a comment, they appear here.</Empty> : null}
        {list.state === 'ready' && list.data.items.length > 0 ? <Table caption="Banned listeners" columns={cols} rows={list.data.items} rowKey={(b) => b.listenerId} /> : null}
      </section>
    </>
  );
}
