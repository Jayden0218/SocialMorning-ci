import type { Db } from '../db.ts';
import { rebuildEpisodeHeat } from '../../heat/rebuild.ts';

/**
 * FR-005a (clarified 2026-09-21: everything goes). One transaction:
 *   1. every comment by the listener: placeholder if it has replies, else delete
 *      (guard G6: "delete unconditionally" breaks the replies' context);
 *   2. delete the listener — sessions, reactions, positions cascade;
 *   3. rebuild heat for every episode touched.
 * The email is free again afterwards because the row is gone, not flagged.
 */
export async function deleteAccount(db: Db, listenerId: string): Promise<{ placeholders: number; deleted: number; episodes: string[] }> {
  return db.transaction(async (tx) => {
    const mine = await tx.query<{ id: string; episode_id: string; replies: number }>(
      `SELECT c.id, c.episode_id, (SELECT count(*)::int FROM comments r WHERE r.parent_id = c.id) AS replies
       FROM comments c WHERE c.author_id = $1`,
      [listenerId],
    );
    const touched = new Set<string>(mine.map((c) => c.episode_id));
    const reacted = await tx.query<{ episode_id: string }>('SELECT DISTINCT episode_id FROM reactions WHERE listener_id = $1', [listenerId]);
    reacted.forEach((r) => touched.add(r.episode_id));

    let placeholders = 0;
    let deleted = 0;
    for (const c of mine) {
      if (Number(c.replies) > 0) {
        await tx.query('UPDATE comments SET body = NULL, author_id = NULL, offset_ms = NULL, deleted_at = now() WHERE id = $1', [c.id]);
        placeholders++;
      } else {
        await tx.query('DELETE FROM comments WHERE id = $1', [c.id]);
        deleted++;
      }
    }
    // M4 (FR-014, guard G7): clips, follows both ways, listened ranges and activity go with
    // the account. The cascades do this; saying it here makes the test's break visible.
    await tx.query(`DELETE FROM activity WHERE actor_id = $1 OR ref_id IN (SELECT id FROM clips WHERE author_id = $1)`, [listenerId]);
    await tx.query('DELETE FROM clips WHERE author_id = $1', [listenerId]);
    await tx.query('DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1', [listenerId]);
    await tx.query('DELETE FROM listened_ranges WHERE listener_id = $1', [listenerId]);
    await tx.query('DELETE FROM listeners WHERE id = $1', [listenerId]);
    for (const episodeId of touched) await rebuildEpisodeHeat(tx, episodeId);
    return { placeholders, deleted, episodes: [...touched] };
  });
}
