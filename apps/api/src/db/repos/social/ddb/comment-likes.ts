// Comment likes on DynamoDB: the like on both sides and the comment's count in one transaction; never your own, never across a block.
/**
 * M26 lane SC (SC-T03; data-model.md §3, §7 A). A like is two items written together with the count it moves:
 * `L#<liker>/CLIKE#<episodeId>#<commentId>` (the poll's "liked by me" = one Query of the viewer's partition) and
 * `EP#<episodeId>/CL#<commentId>#<liker>` (the comment's side: the cascade when the comment goes), plus
 * `likeCount` on the comment and `likesV` on the episode's SOCIAL item (the poll's ETag) — conditional on the
 * like being new (or present, to remove), so a repeat never counts twice (guard G-M26-SC1).
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { isBlockedBy } from '../../safety/blocks.ts';
import type { LikeState } from '../comment-likes.ts';
import { notify } from '../notifications.ts';
import * as B from './sc-bridge.ts';
import { bumpSocial, commentItemById, commitRetry, keyOf, nowIso, rawPg, UUID } from './sc-common.ts';
import { likedByViewer, likesFrom } from './comments.ts';
import { prefixItems } from './sc-common.ts';

async function likeable(store: Store, db: Db, commentId: string, listenerId: string): Promise<Item> {
  if (!UUID.test(commentId)) throw new ApiError('not_found', 'No such comment.');
  const it = await commentItemById(store, commentId);
  if (!it || typeof it['authorId'] !== 'string' || it['deletedAt'] || it['removedAt'] || it['hostHiddenAt']) throw new ApiError('not_found', 'No such comment.');
  const authorId = String(it['authorId']);
  // G-C2: the author check comes before the block check so the answer names the reason.
  if (authorId === listenerId) throw new ApiError('own_comment', "You can't like your own comment.");
  if ((await isBlockedBy(db, authorId, listenerId)) || (await isBlockedBy(db, listenerId, authorId))) throw new ApiError('not_found', 'No such comment.');
  return it;
}

async function countOf(store: Store, it: Item): Promise<number> {
  return Number((await get(store, 'main', keyOf(it)))?.['likeCount'] ?? 0);
}

/** The like, its other side, the comment's count and the episode stamp — one transaction; false when it was there already. */
export async function addLike(store: Store, it: Item, listenerId: string, at: string): Promise<boolean> {
  const episodeId = String(it['episodeId']);
  const commentId = String(it['id']);
  try {
    await commitRetry(store, (t) => {
      t.put('main', encode('commentLikeBy', K.commentLikeBy(episodeId, commentId, listenerId), { listenerId, episodeId, commentId, createdAt: at }), { condition: 'attribute_not_exists(PK)', label: 'like' });
      t.put('main', encode('commentLike', K.commentLike(listenerId, episodeId, commentId), { listenerId, episodeId, commentId, createdAt: at }));
      t.update('main', keyOf(it), { update: 'ADD #n :one', condition: 'attribute_exists(PK)', names: { '#n': 'likeCount' }, values: { ':one': 1 }, label: 'comment' });
      bumpSocial(t, episodeId, at, { likes: true });
    });
    return true;
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('like')) return false;
    if (e instanceof TxCancelled && e.failed('comment')) throw new ApiError('not_found', 'No such comment.');
    throw e;
  }
}

/** The mirror: false when there was no like to take away. */
export async function removeLike(store: Store, it: Item, listenerId: string, at: string): Promise<boolean> {
  const episodeId = String(it['episodeId']);
  const commentId = String(it['id']);
  try {
    await commitRetry(store, (t) => {
      t.delete('main', K.commentLikeBy(episodeId, commentId, listenerId), { condition: 'attribute_exists(PK)', label: 'like' });
      t.delete('main', K.commentLike(listenerId, episodeId, commentId));
      t.update('main', keyOf(it), { update: 'ADD #n :minus', condition: 'attribute_exists(PK)', names: { '#n': 'likeCount' }, values: { ':minus': -1 }, label: 'comment' });
      bumpSocial(t, episodeId, at, { likes: true });
    });
    return true;
  } catch (e) {
    if (e instanceof TxCancelled && (e.failed('like') || e.failed('comment'))) return false;
    throw e;
  }
}

export async function like(store: Store, db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  const it = await likeable(store, db, commentId, listenerId);
  const at = nowIso(store);
  const added = await addLike(store, it, listenerId, at);
  if (added) {
    const raw = rawPg(db);
    if (raw) await B.insertCommentLike(raw, commentId, listenerId, at);
    // M21 US10 (G-M21-9): a new like tells the author (lane SG).
    const parentId = it['parentId'] ? String(it['parentId']) : undefined;
    await notify(db, { recipientId: String(it['authorId']), actorId: listenerId, kind: 'like', ref: { commentId, episodeId: String(it['episodeId']), ...(parentId ? { parentId } : {}) } });
  }
  return { likeCount: await countOf(store, it), likedByMe: true };
}

/** Idempotent: un-liking something you never liked is fine. Only a comment that does not exist at all is 404. */
export async function unlike(store: Store, db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  if (!UUID.test(commentId)) throw new ApiError('not_found', 'No such comment.');
  const it = await commentItemById(store, commentId);
  if (!it) throw new ApiError('not_found', 'No such comment.');
  if (await removeLike(store, it, listenerId, nowIso(store))) {
    const raw = rawPg(db);
    if (raw) await B.deleteCommentLike(raw, commentId, listenerId);
  }
  return { likeCount: await countOf(store, it), likedByMe: false };
}

export async function likesOnEpisode(store: Store, _db: Db, episodeId: string, viewerId?: string): Promise<Map<string, LikeState>> {
  const items = await prefixItems(store, K.EP(episodeId), 'C#');
  return likesFrom(items, await likedByViewer(store, episodeId, viewerId));
}

/** Part of the social poll's ETag: every like and un-like moves the episode's `likesV`. */
export async function likesStamp(store: Store, _db: Db, episodeId: string): Promise<string> {
  return String((await get(store, 'main', K.episodeSocial(episodeId)))?.['likesV'] ?? 0);
}
