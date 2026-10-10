// Muted notice threads: no more notices or pushes from one comment thread or one like-post.
/**
 * M22 US3 (spec FR-011, FR-012; contracts/api.md "Push"). A muted thread is private to the
 * listener who muted it: `muted_threads(listener_id, thread_kind, thread_key)`. `notify()` and
 * `pushFor()` read the table (lane 1); this file writes it and lists it for Settings › Privacy.
 *
 * Thread keys are the ones `threadOf` in `account/push.ts` makes: a comment thread is the top
 * comment's id; a like-post is `<ownerId>:<episodeId>`.
 *
 * "Stop like notices" is the comment author's own switch on one comment (`like_notices_off`):
 * likes on it make no notice, replies still do.
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type ThreadKind = 'comment' | 'like_post';
export type MutedThread = { threadKind: ThreadKind; threadKey: string; title: string; createdAt: string };

const UUID = /^[0-9a-f-]{36}$/i;

/** A key this server could have made: a comment id, or `<uuid>:<episode id>`. */
export function validThreadKey(kind: ThreadKind, key: string): boolean {
  if (key.length === 0 || key.length > 300) return false;
  if (kind === 'comment') return UUID.test(key);
  const i = key.indexOf(':');
  return i === 36 && UUID.test(key.slice(0, 36)) && key.length > 37;
}

async function muteThreadPg(db: Db, listenerId: string, kind: ThreadKind, key: string): Promise<void> {
  await db.query(
    'INSERT INTO muted_threads (listener_id, thread_kind, thread_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [listenerId, kind, key],
  );
}

async function unmuteThreadPg(db: Db, listenerId: string, kind: ThreadKind, key: string): Promise<void> {
  await db.query('DELETE FROM muted_threads WHERE listener_id = $1 AND thread_kind = $2 AND thread_key = $3', [listenerId, kind, key]);
}

/**
 * My muted threads, newest first, each with a line that says what it is: the comment's words (or
 * "A comment" once it is gone), or the liked episode's title.
 */
async function listMutedThreadsPg(db: Db, listenerId: string): Promise<MutedThread[]> {
  const rows = await db.query<{ thread_kind: ThreadKind; thread_key: string; created_at: Date | string; comment_body: string | null; episode_title: string | null }>(
    `SELECT m.thread_kind, m.thread_key, m.created_at,
            CASE WHEN c.deleted_at IS NULL AND c.removed_at IS NULL THEN left(c.body, 80) END AS comment_body,
            e.title AS episode_title
       FROM muted_threads m
       LEFT JOIN comments c ON m.thread_kind = 'comment' AND c.id::text = m.thread_key
       LEFT JOIN episodes e ON m.thread_kind = 'like_post' AND e.id = substr(m.thread_key, 38)
      WHERE m.listener_id = $1
      ORDER BY m.created_at DESC
      LIMIT 200`,
    [listenerId],
  );
  return rows.map((r) => ({
    threadKind: r.thread_kind,
    threadKey: r.thread_key,
    title: r.thread_kind === 'comment' ? (r.comment_body ? `Comment: ${r.comment_body}` : 'A comment') : (r.episode_title ? `Like: ${r.episode_title}` : 'A like'),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** FR-012: the comment's author turns its like notices off (or back on). */
export async function setLikeNotices(db: Db, commentId: string, listenerId: string, off: boolean): Promise<'ok' | 'not_found' | 'forbidden'> {
  if (!UUID.test(commentId)) return 'not_found';
  const [c] = await db.query<{ author_id: string | null; deleted_at: string | null }>('SELECT author_id, deleted_at FROM comments WHERE id = $1', [commentId]);
  if (!c || c.deleted_at !== null) return 'not_found';
  if (c.author_id !== listenerId) return 'forbidden';
  await db.query('UPDATE comments SET like_notices_off = $2 WHERE id = $1', [commentId, off]);
  return 'ok';
}

// M26 lane SG: each runs on DynamoDB when the Db carries a Store (src/db/backend.ts; bodies in graph-ddb/).
export const muteThread = dual('sg/index', 'muteThread', muteThreadPg);
export const unmuteThread = dual('sg/index', 'unmuteThread', unmuteThreadPg);
export const listMutedThreads = dual('sg/index', 'listMutedThreads', listMutedThreadsPg);
