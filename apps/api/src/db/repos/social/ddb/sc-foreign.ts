// What the social-content lane reads and writes in other lanes: follows (lane SG's repo), blocks, held comments, reports (still on Postgres).
/**
 * M26 lane SC. These tables belong to lanes that have not moved yet (SG: follows, activity; SF: blocks, reports;
 * ST: held_comments). Where the owning lane has an exported repo function, this lane calls THAT with `db`
 * (it turns dual when the lane moves). The SQL here is only for reads/writes no such function exists for — the
 * same statements the Postgres bodies held. When a lane moves it replaces the function(s) below that touch its
 * tables with its own repo call; CUT deletes this file.
 */
import type { Db } from '../../../db.ts';
import { ATTACHED } from '../../../backend.ts';
import type { Store } from '../../../ddb/store.ts';
import { pgSide } from './sc-common.ts';

const storeOf = (db: Db): Store => { const a = ATTACHED.get(db); if (!a) throw new Error('social: no Store'); return a.store; };

/** SG (moved): the ids this listener follows — lane SG's repo (graph-ddb/follows.ts). */
export async function followedIds(db: Db, viewerId: string): Promise<Set<string>> {
  const { followSet } = await import('../graph-ddb/follows.ts');
  return followSet({ store: storeOf(db), pg: db }, viewerId);
}

/** SG (moved): people who follow this listener and whom this listener follows back. */
export async function mutualFollowIds(db: Db, me: string): Promise<string[]> {
  const { edges, followSet } = await import('../graph-ddb/follows.ts');
  const h = { store: storeOf(db), pg: db };
  const followers = new Set((await edges(h, me, 'followers')).map((e) => e.id));
  return [...await followSet(h, me)].filter((id) => followers.has(id));
}

/** SF: everyone this listener blocked or was blocked by. */
export async function blockedEitherWay(db: Db, viewerId: string): Promise<Set<string>> {
  const rows = await pgSide(db).query<{ id: string }>(
    'SELECT blocked_id AS id FROM blocks WHERE blocker_id = $1 UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = $1', [viewerId]);
  return new Set(rows.map((r) => r.id));
}

/** SF: the clip ids this viewer reported (they stay as placeholders for them — FR-002). */
export async function reportedClipIds(db: Db, viewerId: string): Promise<Set<string>> {
  const rows = await pgSide(db).query<{ target_id: string }>("SELECT target_id FROM reports WHERE reporter_id = $1 AND target_kind = 'clip'", [viewerId]);
  return new Set(rows.map((r) => r.target_id));
}

/** ST: image bytes held by comments waiting for review (part of the image store's ceiling). */
export async function heldImageBytes(db: Db): Promise<number> {
  const [r] = await pgSide(db).query<{ n: string | number | null }>('SELECT coalesce(sum(image_bytes), 0) AS n FROM held_comments');
  return Number(r?.n ?? 0);
}

/** ST: the pictures on comments a listener still has waiting for review (deleted before their account goes). */
export async function heldImagesOf(db: Db, listenerId: string): Promise<{ id: string; image_path: string }[]> {
  return pgSide(db).query<{ id: string; image_path: string }>('SELECT id, image_path FROM held_comments WHERE author_id = $1 AND image_path IS NOT NULL', [listenerId]);
}

/** ST: a held comment's picture is forgotten once its file is gone. */
export async function forgetHeldImage(db: Db, id: string): Promise<void> {
  await pgSide(db).query('UPDATE held_comments SET image_url = NULL, image_path = NULL, image_w = NULL, image_h = NULL, image_bytes = NULL WHERE id = $1', [id]);
}

/** SF: open reports against a deleted listener's comments and clips close as "author deleted" (M6 US2 #8). */
export async function closeReportsAgainst(db: Db, kind: 'comment' | 'clip', ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await pgSide(db).query(
    "UPDATE reports SET closed_at = now(), close_reason = 'author_deleted' WHERE closed_at IS NULL AND target_kind = $1 AND target_id = ANY($2::text[])",
    [kind, [...ids]],
  );
}
