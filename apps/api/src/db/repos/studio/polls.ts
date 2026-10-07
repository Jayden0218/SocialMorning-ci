// Show polls: create, vote once per listener, close, and count votes.
/**
 * M11 US5 — polls on a show (FR-022, FR-023). One vote per listener is the table's primary key
 * (guard G-P1); a second vote changes nothing, and a closed or expired poll takes none.
 * M24 US14: a poll may be multiple choice (`multi`): one vote row per chosen option, so the key is
 * now (poll_id, listener_id, option_idx); a single-choice vote replaces the listener's rows in one
 * transaction, which keeps it to one. The creator may delete a poll (its votes go with it).
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

export type Poll = {
  id: string; question: string; episodeId: string | null; endsAt: string; closedAt: string | null; open: boolean;
  total: number; options: { idx: number; label: string; votes: number }[]; myVote?: number | null;
  /** M24 US14: several options may be chosen; `voters` = how many listeners voted (total counts choices). */
  multi: boolean; voters: number; myVotes?: number[];
};

export const MAX_DAYS = 30;

type Row = { id: string; question: string; episode_id: string | null; ends_at: Date | string; closed_at: Date | string | null; open: boolean; multi: boolean };

async function hydrate(db: Db, rows: Row[], viewerId?: string): Promise<Poll[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [opts, votes, mine, voters] = await Promise.all([
    db.query<{ poll_id: string; idx: number; label: string }>('SELECT poll_id, idx, label FROM poll_options WHERE poll_id = ANY($1::uuid[]) ORDER BY idx', [ids]),
    db.query<{ poll_id: string; option_idx: number; n: string | number }>('SELECT poll_id, option_idx, count(*) AS n FROM poll_votes WHERE poll_id = ANY($1::uuid[]) GROUP BY 1, 2', [ids]),
    viewerId ? db.query<{ poll_id: string; option_idx: number }>('SELECT poll_id, option_idx FROM poll_votes WHERE poll_id = ANY($1::uuid[]) AND listener_id = $2 ORDER BY option_idx', [ids, viewerId]) : Promise.resolve([]),
    db.query<{ poll_id: string; n: string | number }>('SELECT poll_id, count(DISTINCT listener_id) AS n FROM poll_votes WHERE poll_id = ANY($1::uuid[]) GROUP BY 1', [ids]),
  ]);
  return rows.map((r) => {
    const options = opts.filter((o) => o.poll_id === r.id).map((o) => ({
      idx: Number(o.idx), label: o.label,
      votes: Number(votes.find((v) => v.poll_id === r.id && Number(v.option_idx) === Number(o.idx))?.n ?? 0),
    }));
    const my = mine.filter((m) => m.poll_id === r.id).map((m) => Number(m.option_idx));
    return {
      id: r.id, question: r.question, episodeId: r.episode_id, endsAt: new Date(r.ends_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null, open: r.open,
      total: options.reduce((a, o) => a + o.votes, 0), options,
      multi: r.multi === true, voters: Number(voters.find((v) => v.poll_id === r.id)?.n ?? 0),
      ...(viewerId ? { myVote: my[0] ?? null, myVotes: my } : {}),
    };
  });
}

const SELECT = 'SELECT id, question, episode_id, ends_at, closed_at, (closed_at IS NULL AND ends_at > now()) AS open, multi FROM polls';

export async function listPolls(db: Db, feedUrl: string): Promise<Poll[]> {
  return hydrate(db, await db.query<Row>(`${SELECT} WHERE feed_url = $1 ORDER BY created_at DESC LIMIT 50`, [feedUrl]));
}

/** For the app: open polls, and ones closed in the last 7 days so listeners can see how it went. */
export async function pollsForApp(db: Db, feedUrl: string, viewerId?: string): Promise<Poll[]> {
  return hydrate(db, await db.query<Row>(
    `${SELECT} WHERE feed_url = $1 AND coalesce(closed_at, ends_at) > now() - interval '7 days' ORDER BY created_at DESC LIMIT 10`, [feedUrl]), viewerId);
}

export async function createPoll(db: Db, feedUrl: string, by: string, p: { question: string; options: string[]; endsAt: string; episodeId?: string | undefined; multi?: boolean | undefined }): Promise<Poll> {
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
      'INSERT INTO polls (feed_url, episode_id, question, ends_at, created_by, multi) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [feedUrl, p.episodeId ?? null, p.question, new Date(ends).toISOString(), by, p.multi === true],
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

/** M24 US14: the creator deletes a poll; its options and votes go with it (ON DELETE CASCADE). */
export async function deletePoll(db: Db, feedUrl: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such poll.');
  const r = await db.query('DELETE FROM polls WHERE id = $1 AND feed_url = $2 RETURNING id', [id, feedUrl]);
  if (r.length === 0) throw new ApiError('not_found', 'No such poll.');
}

/**
 * A listener's vote; a closed poll answers 409. Returns the poll as the voter now sees it.
 * Single choice: a second vote while open CHANGES the answer (M20 US9, G-M20-7) — the old row is
 * replaced in one transaction, so it stays one vote per listener (G-P1).
 * M24 US14, multiple choice: one number toggles that option; a list (`all`) sets the whole choice.
 */
export async function vote(db: Db, pollId: string, listenerId: string, choice: number | number[], all = false): Promise<Poll> {
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) throw new ApiError('not_found', 'No such poll.');
  const [p] = await db.query<Row>(`${SELECT} WHERE id = $1`, [pollId]);
  if (!p) throw new ApiError('not_found', 'No such poll.');
  if (!p.open) throw new ApiError('conflict', 'This poll has closed.', { reason: 'closed' });
  const idxs = [...new Set(Array.isArray(choice) ? choice : [choice])];
  if (!p.multi && idxs.length !== 1) throw new ApiError('validation', 'Choose one option.', { fields: ['optionIdxs'] });
  const known = await db.query<{ idx: number }>('SELECT idx FROM poll_options WHERE poll_id = $1 AND idx = ANY($2::int[])', [pollId, idxs]);
  if (known.length !== idxs.length) throw new ApiError('validation', 'No such option.', { fields: [Array.isArray(choice) ? 'optionIdxs' : 'optionIdx'] });
  await db.transaction(async (tx) => {
    // One voter's two taps at once must not both insert: votes on a poll are taken one at a time.
    await tx.query('SELECT 1 FROM polls WHERE id = $1 FOR UPDATE', [pollId]);
    if (!p.multi || all) {
      await tx.query('DELETE FROM poll_votes WHERE poll_id = $1 AND listener_id = $2', [pollId, listenerId]);
      for (const i of idxs) await tx.query('INSERT INTO poll_votes (poll_id, listener_id, option_idx) VALUES ($1, $2, $3)', [pollId, listenerId, i]);
      return;
    }
    const gone = await tx.query('DELETE FROM poll_votes WHERE poll_id = $1 AND listener_id = $2 AND option_idx = $3 RETURNING 1', [pollId, listenerId, idxs[0]]);
    if (gone.length === 0) await tx.query('INSERT INTO poll_votes (poll_id, listener_id, option_idx) VALUES ($1, $2, $3)', [pollId, listenerId, idxs[0]]);
  });
  return (await hydrate(db, [p], listenerId))[0]!;
}
