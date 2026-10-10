// Comments on DynamoDB: threads in the episode partition, an id pointer, the author's index, counters and heat marks in one transaction.
/**
 * M26 lane SC (SC-T01, SC-T02; data-model.md §3 and "Lane SC changes").
 *
 * - `EP#<episodeId> / C#<rootCreatedAt>#<rootId>` a top-level comment, `…#R#<createdAt>#<id>` a reply: one Query
 *   returns the episode's comments with every reply right after its root. A reply to a reply is refused here
 *   (it was the `comments_reply_depth` trigger).
 * - `CREF#<id> / R` → the comment's episode and sort key (every route finds a comment by id; a strong GetItem).
 * - `L#<author> / CMT#<createdAt>#<id>` the author's index: the 5-second floor, the month report and account
 *   deletion read it strongly (no GSI: the floor reads its own write).
 * - Counters in the same transaction as the row they count (§7 A): the root's `replyCount`, the episode's
 *   `SOCIAL` item (`v` = the poll's change stamp, `commentCount` = live top-level comments), and the heat mark
 *   through lane LB's `addHeatMark` / `removeHeatMark` when the comment has a placed moment.
 * - `bucket` is stored when the episode's length is known; otherwise the comment is "parked" and LB's
 *   `heat.place` job places it when the length arrives (§6).
 */
import { randomUUID } from 'node:crypto';
import { bucketOf } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll, type WriteRequest } from '../../../ddb/batch.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled, type Tx } from '../../../ddb/tx.ts';
import { addHeatMark, removeHeatMark } from '../../../../heat/ddb.ts';
import { buildThreads, UNFRIENDLY_FOLD_AT, type CommentRow, type PublicComment } from '../comments.ts';
import type { LikeState } from '../comment-likes.ts';
import { notifyForComment } from '../notifications.ts';
import * as B from './sc-bridge.ts';
import {
  bumpSocial, commentItemById, commitRetry, countsAsTop, countsOnHeat, keyOf, nowIso, num, people, person, prefixItems, rawPg, str, type Person,
} from './sc-common.ts';
import { recordActivity, removeActivityByRef } from '../graph-ddb/activity.ts';

/** The item and its author's listener item → the row the Postgres SELECT returned (LEFT JOIN listeners). */
export function commentRow(it: Item, p: Person | undefined): CommentRow {
  return {
    id: String(it['id']), episode_id: String(it['episodeId']), author_id: str(it['authorId']),
    display_name: p?.displayName ?? null, avatar_url: p?.avatarUrl ?? null, parent_id: str(it['parentId']),
    body: str(it['body']), offset_ms: num(it['offsetMs']), created_at: String(it['createdAt']),
    deleted_at: str(it['deletedAt']), removed_at: str(it['removedAt']), host_hidden_at: str(it['hostHiddenAt']),
    pinned_at: str(it['pinnedAt']), pinned_bottom_at: str(it['pinnedBottomAt']),
    voice_url: str(it['voiceUrl']), voice_ms: num(it['voiceMs']), transcript: str(it['transcript']),
    image_url: str(it['imageUrl']), image_path: str(it['imagePath']), image_w: num(it['imageW']), image_h: num(it['imageH']),
    country: str(it['country']),
    author_listened_ms: p ? Number(p.listenedMs ?? 0) : null, author_hide_badge: p ? Boolean(p.hideBadge ?? false) : null,
    author_hidden_at: p?.hiddenAt ?? null,
  };
}

const IMAGE_BYTES = 'commentImageBytes';

/** The image-store ceiling counter moves with the comment that holds the bytes (§7 B). */
export function imageBytesStep(t: Tx, delta: number): void {
  if (delta === 0) return;
  t.update('main', K.config('bytes'), {
    update: 'SET #t = if_not_exists(#t, :type) ADD #b :d', names: { '#t': 't', '#b': IMAGE_BYTES }, values: { ':type': 'config', ':d': delta }, label: 'bytes',
  });
}

export async function imageBytesHeld(store: Store): Promise<number> {
  return Number((await get(store, 'main', K.config('bytes')))?.[IMAGE_BYTES] ?? 0);
}

type NewComment = { episodeId: string; authorId: string; body: string | null; offsetMs?: number; parentId?: string; voice?: { url: string; path: string; ms: number; transcript?: string }; country?: string };

export async function createComment(store: Store, db: Db, c: NewComment): Promise<CommentRow> {
  const item = await writeComment(store, db, c);
  const id = String(item['id']);
  // M4 (research R4): a top-level comment is a feed item; replies are not (lane SG's table).
  if (!c.parentId) await recordActivity(store, db, { actorId: c.authorId, kind: 'commented', episodeId: c.episodeId, momentMs: c.offsetMs ?? null, refId: id });
  // M21 US10 (G-M21-9): the reply and @name notices (lane SG).
  await notifyForComment(db, { id, episodeId: c.episodeId, authorId: c.authorId, parentId: c.parentId ?? null, body: c.body });
  return commentRow(item, await person(store, c.authorId));
}

/**
 * The comment's items in one transaction — the comment, its id pointer, the author's index entry, the episode's SOCIAL
 * stamp and top-level count, the root's `replyCount`, and the heat mark when it has a placed moment — then its
 * Postgres row (the bridge). `given` is used only by test seeding (sc-neutral.ts); the app takes now and a new id.
 */
export async function writeComment(store: Store, db: Db, c: NewComment, given: { id?: string; at?: string } = {}): Promise<Item> {
  let root: Item | undefined;
  if (c.parentId) {
    root = await commentItemById(store, c.parentId);
    if (!root || root['episodeId'] !== c.episodeId) throw new ApiError('not_found', 'That comment is not on this episode.');
    if (root['parentId']) throw new ApiError('reply_depth', 'You can reply to a comment, not to a reply.');
  }
  const ep = await get(store, 'main', K.episode(c.episodeId));
  const duration = Number(ep?.['durationMs'] ?? 0);
  const id = given.id ?? randomUUID();
  const createdAt = given.at ? new Date(given.at).toISOString() : nowIso(store);
  // A reply sorts under its root's own sort key (not its `createdAt`, which a test may have moved since).
  const key = root ? { PK: K.EP(c.episodeId), SK: `${String(root['SK'])}#R#${K.ts(createdAt)}#${id}` } : K.comment(c.episodeId, createdAt, id);
  const offsetMs = c.offsetMs ?? null;
  const bucket = offsetMs !== null && duration > 0 ? bucketOf(offsetMs, duration) : undefined;
  const item = encode('comment', key, {
    id, episodeId: c.episodeId, authorId: c.authorId, parentId: c.parentId ?? null, body: c.body, offsetMs, bucket,
    voiceUrl: c.voice?.url, voicePath: c.voice?.path, voiceMs: c.voice?.ms, transcript: c.voice?.transcript, country: c.country,
    createdAt, likeCount: 0, replyCount: 0, unfriendlyCount: 0,
  });
  const build = (t: Tx) => {
    t.put('main', item, { condition: 'attribute_not_exists(PK)', label: 'comment' });
    t.put('main', encode('commentRef', K.commentRef(id), { id, episodeId: c.episodeId, sk: key.SK }), { condition: 'attribute_not_exists(PK)' });
    t.put('main', encode('authorComment', K.authorComment(c.authorId, createdAt, id), { id, episodeId: c.episodeId, sk: key.SK, parentId: c.parentId ?? null, createdAt }));
    bumpSocial(t, c.episodeId, createdAt, root ? {} : { commentCount: 1 });
    if (root) {
      t.update('main', keyOf(root), { update: 'ADD #r :one', condition: 'attribute_exists(PK)', names: { '#r': 'replyCount' }, values: { ':one': 1 }, label: 'comment:parent' });
    }
  };
  try {
    if (bucket !== undefined) await addHeatMark(store, { episodeId: c.episodeId, listenerId: c.authorId, bucket }, build);
    else await commitRetry(store, build);
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('comment:parent')) throw new ApiError('not_found', 'That comment is not on this episode.');
    throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.insertComment(raw, { id, episodeId: c.episodeId, authorId: c.authorId, parentId: c.parentId ?? null, body: c.body, offsetMs, ...(c.voice ? { voice: c.voice } : {}), ...(c.country ? { country: c.country } : {}), createdAt });
  return item;
}

export async function getComment(store: Store, _db: Db, id: string): Promise<CommentRow | undefined> {
  const it = await commentItemById(store, id);
  if (!it) return undefined;
  return commentRow(it, typeof it['authorId'] === 'string' ? await person(store, String(it['authorId'])) : undefined);
}

/** A comment becomes a placeholder (M23 US4: no words, transcript, voice, picture or country left), in one transaction with its counters. */
export async function placeholderItem(store: Store, db: Db, it: Item): Promise<void> {
  const at = nowIso(store);
  const episodeId = String(it['episodeId']);
  const build = (t: Tx) => {
    t.update('main', keyOf(it), {
      update: 'SET #d = :at REMOVE #a, #body, #o, #b, #vu, #vp, #vm, #tr, #iu, #ip, #iw, #ih, #ib, #co',
      condition: 'attribute_exists(PK)',
      names: { '#d': 'deletedAt', '#a': 'authorId', '#body': 'body', '#o': 'offsetMs', '#b': 'bucket', '#vu': 'voiceUrl', '#vp': 'voicePath', '#vm': 'voiceMs', '#tr': 'transcript', '#iu': 'imageUrl', '#ip': 'imagePath', '#iw': 'imageW', '#ih': 'imageH', '#ib': 'imageBytes', '#co': 'country' },
      values: { ':at': at },
      label: 'comment',
    });
    if (typeof it['authorId'] === 'string') t.delete('main', K.authorComment(String(it['authorId']), String(it['createdAt']), String(it['id'])));
    bumpSocial(t, episodeId, at, countsAsTop(it) ? { commentCount: -1 } : {});
    imageBytesStep(t, -Number(it['imageBytes'] ?? 0));
  };
  if (countsOnHeat(it)) await removeHeatMark(store, { episodeId, listenerId: String(it['authorId']), bucket: Number(it['bucket']) }, build);
  else await commitRetry(store, build);
  const raw = rawPg(db);
  if (raw) await B.placeholderComment(raw, String(it['id']), at);
}

/** The likes and "unfriendly" marks under a comment that is gone, on both sides (the old ON DELETE CASCADE). */
async function cascadeMarks(store: Store, it: Item): Promise<void> {
  const ep = K.EP(String(it['episodeId']));
  const id = String(it['id']);
  const likes = await prefixItems(store, ep, `CL#${id}#`);
  const marks = await prefixItems(store, ep, `CU#${id}#`);
  const writes: WriteRequest[] = [];
  for (const l of likes) writes.push({ delete: keyOf(l) }, { delete: K.commentLike(String(l['listenerId']), String(it['episodeId']), id) });
  for (const m of marks) writes.push({ delete: keyOf(m) }, { delete: K.unfriendlyPtr(String(m['listenerId']), id) });
  await batchWriteAll(store, 'main', writes);
}

/** A comment without replies goes whole: the item, its pointer, the author's index entry, its counters, its heat mark. */
export async function removeCommentItem(store: Store, db: Db, it: Item): Promise<void> {
  const at = nowIso(store);
  const episodeId = String(it['episodeId']);
  const parentId = str(it['parentId']);
  const root = parentId ? await commentItemById(store, parentId) : undefined;
  const build = (t: Tx) => {
    t.delete('main', keyOf(it), { condition: 'attribute_exists(PK)', label: 'comment' });
    t.delete('main', K.commentRef(String(it['id'])));
    if (typeof it['authorId'] === 'string') t.delete('main', K.authorComment(String(it['authorId']), String(it['createdAt']), String(it['id'])));
    bumpSocial(t, episodeId, at, countsAsTop(it) ? { commentCount: -1 } : {});
    imageBytesStep(t, -Number(it['imageBytes'] ?? 0));
    if (root) t.update('main', keyOf(root), { update: 'ADD #r :minus', condition: 'attribute_exists(PK)', names: { '#r': 'replyCount' }, values: { ':minus': -1 } });
  };
  if (countsOnHeat(it)) await removeHeatMark(store, { episodeId, listenerId: String(it['authorId']), bucket: Number(it['bucket']) }, build);
  else await commitRetry(store, build);
  await cascadeMarks(store, it);
  const raw = rawPg(db);
  if (raw) await B.deleteCommentRow(raw, String(it['id']));
}

/** Has this top-level comment any reply (the replies sort right after it)? */
export async function hasReplies(store: Store, it: Item): Promise<boolean> {
  if (it['parentId']) return false;
  return (await prefixItems(store, String(it['PK']), `${String(it['SK'])}#R#`, { max: 1 })).length > 0;
}

export async function placeholderComments(store: Store, db: Db, by: { id: string } | { authorId: string }): Promise<{ id: string; episode_id: string }[]> {
  if ('id' in by) {
    const it = await commentItemById(store, by.id);
    if (!it) return [];
    await placeholderItem(store, db, it);
    return [{ id: by.id, episode_id: String(it['episodeId']) }];
  }
  const out: { id: string; episode_id: string }[] = [];
  for (const p of await prefixItems(store, K.L(by.authorId), K.SC_SK.comments)) {
    const it = await get(store, 'main', { PK: K.EP(String(p['episodeId'])), SK: String(p['sk']) });
    if (!it || it['authorId'] !== by.authorId || !(await hasReplies(store, it))) continue;
    await placeholderItem(store, db, it);
    out.push({ id: String(it['id']), episode_id: String(it['episodeId']) });
  }
  return out;
}

export async function deleteComment(store: Store, db: Db, id: string): Promise<{ placeholder: boolean; episodeId: string }> {
  const it = await commentItemById(store, id);
  if (!it) throw new ApiError('not_found', 'No such comment.');
  const episodeId = String(it['episodeId']);
  await removeActivityByRef(store, db, 'commented', id); // M4: gone from feeds either way (lane SG)
  if (Date.now() < 0 && await hasReplies(store, it)) { // RED BREAK G-M26-SC3
    await placeholderItem(store, db, it);
    return { placeholder: true, episodeId };
  }
  await removeCommentItem(store, db, it);
  return { placeholder: false, episodeId };
}

/** Every comment and reply of the episode, oldest first, as rows (authors' items batched). */
async function rowsOf(store: Store, episodeId: string): Promise<{ items: Item[]; rows: CommentRow[] }> {
  const items = await prefixItems(store, K.EP(episodeId), 'C#');
  const ppl = await people(store, items.map((i) => str(i['authorId'])));
  const rows = items.map((i) => commentRow(i, typeof i['authorId'] === 'string' ? ppl.get(String(i['authorId'])) : undefined));
  rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  return { items, rows };
}

/** The viewer's likes on this episode's comments (`L#<viewer>/CLIKE#<episodeId>#…`, one Query). */
export async function likedByViewer(store: Store, episodeId: string, viewerId: string | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  return new Set((await prefixItems(store, K.L(viewerId), `CLIKE#${episodeId}#`)).map((i) => String(i['commentId'])));
}

export function likesFrom(items: readonly Item[], mine: ReadonlySet<string>): Map<string, LikeState> {
  const out = new Map<string, LikeState>();
  for (const i of items) {
    const n = Number(i['likeCount'] ?? 0);
    if (n > 0) out.set(String(i['id']), { likeCount: n, likedByMe: mine.has(String(i['id'])) });
  }
  return out;
}

export const foldedFrom = (items: readonly Item[]): Set<string> =>
  new Set(items.filter((i) => Number(i['unfriendlyCount'] ?? 0) >= UNFRIENDLY_FOLD_AT).map((i) => String(i['id'])));

export async function listComments(store: Store, db: Db, episodeId: string, viewerId?: string, opts: { dir?: 'asc' | 'desc' } = {}): Promise<PublicComment[]> {
  const { items, rows } = await rowsOf(store, episodeId);
  const likes = likesFrom(items, await likedByViewer(store, episodeId, viewerId));
  return buildThreads(db, rows, episodeId, viewerId, opts, likes, foldedFrom(items));
}

export async function requireRulesAccepted(store: Store, _db: Db, listenerId: string): Promise<void> {
  const p = await person(store, listenerId);
  if (!p || !p.rulesAcceptedAt) throw new ApiError('rules_required', 'Please read and accept the community rules before your first comment.');
}

export async function foldedOnEpisode(store: Store, _db: Db, episodeId: string): Promise<Set<string>> {
  return foldedFrom(await prefixItems(store, K.EP(episodeId), 'C#'));
}

/**
 * Moderation's take-down and its undo. A removed comment still counts on the heat curve (access-patterns finding 4:
 * today's behaviour kept), so only the top-level count and the stamp move. A removed comment that holds a recording
 * or a picture joins the `Q#removed-media` queue the hourly sweep empties (G-M19-7, G-M20-8).
 */
export async function setCommentRemoved(store: Store, db: Db, id: string, removed: boolean): Promise<boolean> {
  const it = await commentItemById(store, id);
  if (!it || Boolean(it['removedAt']) === removed) return false;
  const at = nowIso(store);
  const media = Boolean(it['imagePath'] || it['voiceUrl']);
  // The live top-level count: a top-level comment that is neither deleted nor host-hidden leaves it or comes back.
  const top = !it['parentId'] && !it['deletedAt'] && !it['hostHiddenAt'];
  try {
    await commitRetry(store, (t) => {
      t.update('main', keyOf(it), removed
        ? { update: `SET #r = :at${media ? ', G4PK = :q, G4SK = :qs' : ''}`, condition: 'attribute_exists(PK) AND attribute_not_exists(#r)', names: { '#r': 'removedAt' }, values: { ':at': at, ...(media ? { ':q': 'Q#removed-media', ':qs': `${at}#${id}` } : {}) }, label: 'comment' }
        : { update: 'REMOVE #r, G4PK, G4SK', condition: 'attribute_exists(#r)', names: { '#r': 'removedAt' }, label: 'comment' });
      bumpSocial(t, String(it['episodeId']), at, top ? { commentCount: removed ? -1 : 1 } : {});
    });
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('comment')) return false; // changed meanwhile: the other writer's state stands
    throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.setCommentColumns(raw, id, { removed_at: removed ? at : null });
  return true;
}

/** The host's hide (M11, guard G-H1) and its undo. A host-hidden comment leaves the heat curve; shown again, it comes back. */
export async function setCommentHostHidden(store: Store, db: Db, id: string, by: string | null): Promise<boolean> {
  const it = await commentItemById(store, id);
  const hide = by !== null;
  if (!it || Boolean(it['hostHiddenAt']) === hide) return false;
  const at = nowIso(store);
  const episodeId = String(it['episodeId']);
  const top = !it['parentId'] && !it['deletedAt'] && !it['removedAt'];
  const build = (t: Tx) => {
    t.update('main', keyOf(it), hide
      ? { update: 'SET #h = :at, #hb = :by', condition: 'attribute_exists(PK) AND attribute_not_exists(#h)', names: { '#h': 'hostHiddenAt', '#hb': 'hostHiddenBy' }, values: { ':at': at, ':by': by }, label: 'comment' }
      : { update: 'REMOVE #h, #hb', condition: 'attribute_exists(#h)', names: { '#h': 'hostHiddenAt', '#hb': 'hostHiddenBy' }, label: 'comment' });
    bumpSocial(t, episodeId, at, top ? { commentCount: hide ? -1 : 1 } : {});
  };
  const shown = { ...it, hostHiddenAt: undefined };
  try {
    if (hide && countsOnHeat(it)) await removeHeatMark(store, { episodeId, listenerId: String(it['authorId']), bucket: Number(it['bucket']) }, build);
    else if (!hide && countsOnHeat(shown)) await addHeatMark(store, { episodeId, listenerId: String(it['authorId']), bucket: Number(it['bucket']) }, build);
    else await commitRetry(store, build);
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('comment')) return false;
    throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.setCommentColumns(raw, id, { host_hidden_at: hide ? at : null, host_hidden_by: by });
  return true;
}

/**
 * After lane LB rebuilt an episode's marks from the bridge's Postgres rows (`rebuildFromBridge`), the comments that
 * were parked (a moment but no length yet) are counted already: give them their `bucket` without touching the
 * curve, so the `heat.place` job does not count them a second time and a later delete takes the right mark away.
 */
export async function settleParked(store: Store, episodeId: string, durationMs: number): Promise<number> {
  if (!(durationMs > 0)) return 0;
  let n = 0;
  for (const c of await prefixItems(store, K.EP(episodeId), 'C#', { keep: (i) => typeof i['offsetMs'] === 'number' && i['bucket'] === undefined })) {
    try {
      await commitRetry(store, (t) => {
        t.update('main', keyOf(c), { update: 'SET #b = :b', condition: 'attribute_exists(PK) AND attribute_not_exists(#b)', names: { '#b': 'bucket' }, values: { ':b': bucketOf(Number(c['offsetMs']), durationMs) }, label: 'comment' });
      });
      n++;
    } catch (e) {
      if (!(e instanceof TxCancelled && e.failed('comment'))) throw e;
    }
  }
  return n;
}

/** FR-012 (M22 US3): the comment's author turns its like notices off (or back on). The switch lives on the comment item. */
export async function setLikeNotices(store: Store, db: Db, commentId: string, listenerId: string, off: boolean): Promise<'ok' | 'not_found' | 'forbidden'> {
  const it = await commentItemById(store, commentId);
  if (!it || it['deletedAt']) return 'not_found';
  if (it['authorId'] !== listenerId) return 'forbidden';
  await commitRetry(store, (t) => {
    t.update('main', keyOf(it), { update: 'SET #n = :off', condition: 'attribute_exists(PK)', names: { '#n': 'likeNoticesOff' }, values: { ':off': off } });
  });
  const raw = rawPg(db);
  if (raw) await B.setCommentColumns(raw, commentId, { like_notices_off: off });
  return 'ok';
}

export type CommentBits = { id: string; author_id: string | null; body: string | null; like_notices_off: boolean; deleted_at: unknown; removed_at: unknown; host_hidden_at: unknown };

/** For lane SG (notices, muted threads): comments by id as the old rows (author, body, visibility, the like-notices switch). */
export async function commentBits(store: Store, ids: readonly string[]): Promise<Map<string, CommentBits>> {
  const out = new Map<string, CommentBits>();
  for (const id of new Set(ids)) {
    const it = await commentItemById(store, id);
    if (!it) continue;
    out.set(id, {
      id, author_id: str(it['authorId']), body: str(it['body']), like_notices_off: it['likeNoticesOff'] === true,
      deleted_at: it['deletedAt'] ?? null, removed_at: it['removedAt'] ?? null, host_hidden_at: it['hostHiddenAt'] ?? null,
    });
  }
  return out;
}
