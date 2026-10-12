// What the social-content lane reads in other lanes: follows (lane SG's repo), blocks, held comments, reports.
/**
 * Each function calls the owning lane's repo or items with the Store this `db` carries.
 */
import type { Db } from '../../../db.ts';
import { ATTACHED } from '../../../backend.ts';
import type { Store } from '../../../ddb/store.ts';

const storeOf = (db: Db): Store => { const a = ATTACHED.get(db); if (!a) throw new Error('social: no Store'); return a.store; };

/** SG: the ids this listener follows — lane SG's repo (graph-ddb/follows.ts). */
export async function followedIds(db: Db, viewerId: string): Promise<Set<string>> {
  const { followSet } = await import('../graph-ddb/follows.ts');
  return followSet({ store: storeOf(db), db }, viewerId);
}

/** SG: people who follow this listener and whom this listener follows back. */
export async function mutualFollowIds(db: Db, me: string): Promise<string[]> {
  const { edges, followSet } = await import('../graph-ddb/follows.ts');
  const h = { store: storeOf(db), db };
  const followers = new Set((await edges(h, me, 'followers')).map((e) => e.id));
  return [...await followSet(h, me)].filter((id) => followers.has(id));
}

/** SF: everyone this listener blocked or was blocked by — lane SF's `blockedEitherWay`. */
export async function blockedEitherWay(db: Db, viewerId: string): Promise<Set<string>> {
  return (await import('../../safety/ddb/blocks.ts')).blockedEitherWay(storeOf(db), viewerId);
}

/** SF: the clip ids this viewer reported (they stay as placeholders for them — FR-002) — SF's reporter marks. */
export async function reportedClipIds(db: Db, viewerId: string): Promise<Set<string>> {
  const { reported } = await (await import('../../safety/ddb/reports.ts')).hiddenFor(storeOf(db), db, viewerId);
  return new Set(reported.filter((r) => r.kind === 'clip').map((r) => r.id));
}

/** ST: image bytes held by comments waiting for review (part of the image store's ceiling). */
export async function heldImageBytes(db: Db): Promise<number> {
  return (await import('../../studio/ddb/comments.ts')).heldImageBytes(storeOf(db));
}

/** ST: the pictures on comments a listener still has waiting for review (deleted before their account goes). */
export async function heldImagesOf(db: Db, listenerId: string): Promise<{ id: string; image_path: string }[]> {
  return (await import('../../studio/ddb/comments.ts')).heldWithImagesOf(storeOf(db), listenerId);
}

/** ST: a held comment's picture is forgotten once its file is gone. */
export async function forgetHeldImage(db: Db, id: string): Promise<void> {
  await (await import('../../studio/ddb/comments.ts')).forgetHeldImage(storeOf(db), id);
}

/** SF: open reports against a deleted listener's comments and clips close as "author deleted" (M6 US2 #8). */
export async function closeReportsAgainst(db: Db, kind: 'comment' | 'clip', ids: readonly string[]): Promise<void> {
  const { closeReportsFor } = await import('../../safety/ddb/reports.ts');
  for (const id of ids) await closeReportsFor(storeOf(db), db, kind, id, null, 'author_deleted');
}
