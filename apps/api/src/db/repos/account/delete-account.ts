// Deletes an account and its data in one step, keeping reply threads intact.
import type { Db } from '../../db.ts';
import { rebuildEpisodeHeat } from '../../../heat/rebuild.ts';
import { placeholderComments } from '../social/comments.ts';

/**
 * FR-005a (clarified 2026-09-21: everything goes). One transaction:
 *   1. every comment by the listener: placeholder if it has replies, else delete
 *      (guard G6: "delete unconditionally" breaks the replies' context) — two set-based
 *      statements since M23;
 *   2. delete the listener — sessions, reactions, positions cascade;
 *   3. rebuild heat for every episode touched.
 * The email is free again afterwards because the row is gone, not flagged.
 */
export async function deleteAccount(db: Db, listenerId: string): Promise<{ placeholders: number; deleted: number; episodes: string[] }> {
  return db.transaction(async (tx) => {
    // M6 (US2 #8): open reports against this listener's content close as "author deleted"; reports BY them stay, anonymised by the FK.
    await tx.query(
      `UPDATE reports SET closed_at = now(), close_reason = 'author_deleted' WHERE closed_at IS NULL AND (
         (target_kind = 'profile' AND target_id = $1::text)
         OR (target_kind = 'comment' AND target_id IN (SELECT id::text FROM comments WHERE author_id = ($1::text)::uuid))
         OR (target_kind = 'clip' AND target_id IN (SELECT id::text FROM clips WHERE author_id = ($1::text)::uuid)))`,
      [listenerId],
    );
    // M23 US4 (FR-007, G-M23-6): set-based — one statement for the placeholders (the same helper
    // single-comment deletion uses), one for the rest; no statement per comment.
    const touched = new Set<string>();
    const kept = await placeholderComments(tx, { authorId: listenerId });
    kept.forEach((c) => touched.add(c.episode_id));
    const gone = await tx.query<{ episode_id: string }>(
      `DELETE FROM comments c WHERE c.author_id = $1 AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id) RETURNING c.episode_id`,
      [listenerId],
    );
    gone.forEach((c) => touched.add(c.episode_id));
    const reacted = await tx.query<{ episode_id: string }>('SELECT DISTINCT episode_id FROM reactions WHERE listener_id = $1', [listenerId]);
    reacted.forEach((r) => touched.add(r.episode_id));
    const placeholders = kept.length;
    const deleted = gone.length;
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
