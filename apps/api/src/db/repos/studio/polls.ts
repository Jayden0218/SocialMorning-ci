// Show polls: create, vote once per listener, close, and count votes.
/**
 * M11 US5 — polls on a show (FR-022, FR-023). One vote per listener is the table's primary key
 * (guard G-P1); a second vote changes nothing, and a closed or expired poll takes none.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

export type Poll = {
  id: string; question: string; episodeId: string | null; endsAt: string; closedAt: string | null; open: boolean;
  total: number; options: { idx: number; label: string; votes: number }[]; myVote?: number | null;
};

export const MAX_DAYS = 30;

type Row = { id: string; question: string; episode_id: string | null; ends_at: Date | string; closed_at: Date | string | null; open: boolean };

async function hydrate(db: Db, rows: Row[], viewerId?: string): Promise<Poll[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [opts, votes, mine] = await Promise.all([
    db.query<{ poll_id: string; idx: number; label: string }>('SELECT poll_id, idx, label FROM poll_options WHERE poll_id = ANY($1::uuid[]) ORDER BY idx', [ids]),
    db.query<{ poll_id: string; option_idx: number; n: string | number }>('SELECT poll_id, option_idx, count(*) AS n FROM poll_votes WHERE poll_id = ANY($1::uuid[]) GROUP BY 1, 2', [ids]),
    viewerId ? db.query<{ poll_id: string; option_idx: number }>('SELECT poll_id, option_idx FROM poll_votes WHERE poll_id = ANY($1::uuid[]) AND listener_id = $2', [ids, viewerId]) : Promise.resolve([]),
  ]);
  return rows.map((r) => {
    const options = opts.filter((o) => o.poll_id === r.id).map((o) => ({
      idx: Number(o.idx), label: o.label,
      votes: Number(votes.find((v) => v.poll_id === r.id && Number(v.option_idx) === Number(o.idx))?.n ?? 0),
    }));
    const my = mine.find((m) => m.poll_id === r.id);
    return {
      id: r.id, question: r.question, episodeId: r.episode_id, endsAt: new Date(r.ends_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null, open: r.open,
      total: options.reduce((a, o) => a + o.votes, 0), options,
      ...(viewerId ? { myVote: my ? Number(my.option_idx) : null } : {}),
    };
  });
}

const SELECT = 'SELECT id, question, episode_id, ends_at, closed_at, (closed_at IS NULL AND ends_at > now()) AS open FROM polls';

export async function listPolls(db: Db, feedUrl: string): Promise<Poll[]> {
  return hydrate(db, await db.query<Row>(`${SELECT} WHERE feed_url = $1 ORDER BY created_at DESC LIMIT 50`, [feedUrl]));
}

/** For the app: open polls, and ones closed in the last 7 days so listeners can see how it went. */
export async function pollsForApp(db: Db, feedUrl: string, viewerId?: string): Promise<Poll[]> {
  return hydrate(db, await db.query<Row>(
    `${SELECT} WHERE feed_url = $1 AND coalesce(closed_at, ends_at) > now() - interval '7 days' ORDER BY created_at DESC LIMIT 10`, [feedUrl]), viewerId);
}

export async function createPoll(db: Db, feedUrl: string, by: string, p: { question: string; options: string[]; endsAt: string; episodeId?: string }): Promise<Poll> {
  const ends = Date.parse(p.endsAt);
  if (!Number.isFinite(ends) || ends <= Date.now() || ends > Date.now() + MAX_DAYS * 86_400_000) {
    throw new ApiError('validation', `The end must be in the next ${MAX_DAYS} days.`, { fields: ['endsAt'] });
  }
  if (p.episodeId) {
    const [e] = await db.query('SELECT 1 FROM episodes WHERE id = $1 AND feed_url = $2', [p.episodeId, feedUrl]);
    if (!e) throw new ApiError('validation', 'That episode is not on this show.', { fields: ['episodeId'] });
  }
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.query<{ id: string }>(
      'INSERT INTO polls (feed_url, episode_id, question, ends_at, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [feedUrl, p.episodeId ?? null, p.question, new Date(ends).toISOString(), by],
    );
    for (const [i, label] of p.options.entries()) await tx.query('INSERT INTO poll_options (poll_id, idx, label) VALUES ($1, $2, $3)', [r!.id, i, label]);
    return r!.id;
  });
  return (await hydrate(db, await db.query<Row>(`${SELECT} WHERE id = $1`, [id])))[0]!;
}

export async function closePoll(db: Db, feedUrl: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such poll.');
  const r = await db.query('UPDATE polls SET closed_at = coalesce(closed_at, now()) WHERE id = $1 AND feed_url = $2 RETURNING id', [id, feedUrl]);
  if (r.length === 0) throw new ApiError('not_found', 'No such poll.');
}

/** A listener's vote. The first one stands; a closed poll answers 409. Returns the poll as the voter now sees it. */
export async function vote(db: Db, pollId: string, listenerId: string, idx: number): Promise<Poll> {
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) throw new ApiError('not_found', 'No such poll.');
  const [p] = await db.query<Row>(`${SELECT} WHERE id = $1`, [pollId]);
  if (!p) throw new ApiError('not_found', 'No such poll.');
  if (!p.open) throw new ApiError('conflict', 'This poll has closed.', { reason: 'closed' });
  const [o] = await db.query('SELECT 1 FROM poll_options WHERE poll_id = $1 AND idx = $2', [pollId, idx]);
  if (!o) throw new ApiError('validation', 'No such option.', { fields: ['optionIdx'] });
  await db.query('INSERT INTO poll_votes (poll_id, listener_id, option_idx) VALUES ($1, $2, $3) ON CONFLICT (poll_id, listener_id) DO NOTHING', [pollId, listenerId, idx]);
  return (await hydrate(db, [p], listenerId))[0]!;
}
