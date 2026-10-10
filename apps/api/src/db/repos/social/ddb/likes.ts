// Episode likes on DynamoDB: the like and its time-ordered copy in the owner's partition, and a like post's comments and reactions under one partition.
/**
 * M26 lane SC (SC-T03; M19 US3, M21 US7).
 * - `L#<owner> / ELIKE#<episodeId>`: the like (note, time) — "my like" and the post's like are one GetItem.
 * - `L#<owner> / ELIKET#<createdAt>#<episodeId>`: the same like in time order — an owner's likes newest first are one
 *   Query with a keyset `before`; the follower timeline merges the followed accounts' Queries (lane SG's follows).
 * - `LK#<owner>#<episodeId> / C#<createdAt>#<id>` like-post comments, `/ R#<listener>` one reaction each; the writer's
 *   side `L#<writer>/LKC#…` / `LKR#…` lets account deletion find them. Unliking deletes the partition (the old cascade).
 * The visibility rules (public likes or the owner, no block either way, owner not suspended or hidden, show not
 * hidden, episode known) are applied in code from lane AC's listener items, lane SF's blocks and hidden feeds, and lane
 * LB's episode items.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { batchGetAll, batchWriteAll, type WriteRequest } from '../../../ddb/batch.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryPage, get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { hiddenFeedUrls } from '../../safety/moderation.ts';
import { mutedIdsFor } from '../mutes.ts';
import { LIKE_COMMENTS_MAX, TIMELINE_PAGE, type LikeComment, type LikeItem, type LikePost } from '../likes.ts';
import * as B from './sc-bridge.ts';
import { keyOf, nowIso, partitionAll, people, person, prefixItems, rawPg, visiblePerson, type Person } from './sc-common.ts';
import { blockedEitherWay, followedIds } from './sc-foreign.ts';

const publicLikes = (p: Person): boolean => p.likesPublic !== false;

export async function like(store: Store, db: Db, listenerId: string, episodeId: string, note: string | undefined): Promise<void> {
  const at = nowIso(store);
  for (let attempt = 1; ; attempt++) {
    const cur = await get(store, 'main', K.episodeLike(listenerId, episodeId));
    try {
      if (cur) {
        // ON CONFLICT DO UPDATE SET note: the time stays.
        const createdAt = String(cur['createdAt']);
        const set = note === undefined ? { update: 'REMOVE #n', names: { '#n': 'note' } } : { update: 'SET #n = :n', names: { '#n': 'note' }, values: { ':n': note } };
        await tx(store)
          .update('main', K.episodeLike(listenerId, episodeId), { ...set, condition: 'attribute_exists(PK)', label: 'like' })
          .update('main', K.episodeLikeTime(listenerId, createdAt, episodeId), { ...set, condition: 'attribute_exists(PK)' })
          .commit();
      } else {
        const attrs = { listenerId, episodeId, note: note ?? null, createdAt: at };
        await tx(store)
          .put('main', encode('episodeLike', K.episodeLike(listenerId, episodeId), attrs), { condition: 'attribute_not_exists(PK)', label: 'like' })
          .put('main', encode('episodeLikeTime', K.episodeLikeTime(listenerId, at, episodeId), attrs))
          .commit();
      }
      break;
    } catch (e) {
      if (attempt < 4 && e instanceof TxCancelled && (e.failed('like') || e.conflict)) continue;
      throw e;
    }
  }
  const raw = rawPg(db);
  if (raw) await B.upsertEpisodeLike(raw, { listenerId, episodeId, note: note ?? null, createdAt: at });
}

/** The like post's comments and reactions go with the like, and the writers' pointers to them. */
async function dropPost(store: Store, ownerId: string, episodeId: string): Promise<void> {
  const children = await partitionAll(store, K.LK(ownerId, episodeId));
  const writes: WriteRequest[] = [];
  for (const c of children) {
    writes.push({ delete: keyOf(c) });
    const sk = String(c['SK']);
    if (sk.startsWith('C#')) writes.push({ delete: K.likeCommentPtr(String(c['authorId']), ownerId, episodeId, String(c['id'])) });
    else if (sk.startsWith('R#')) writes.push({ delete: K.likeReactionPtr(String(c['listenerId']), ownerId, episodeId) });
  }
  await batchWriteAll(store, 'main', writes);
}

export async function unlike(store: Store, db: Db, listenerId: string, episodeId: string): Promise<void> {
  const cur = await get(store, 'main', K.episodeLike(listenerId, episodeId));
  if (cur) {
    try {
      await tx(store)
        .delete('main', K.episodeLike(listenerId, episodeId), { condition: 'attribute_exists(PK)', label: 'like' })
        .delete('main', K.episodeLikeTime(listenerId, String(cur['createdAt']), episodeId))
        .commit();
    } catch (e) {
      if (!(e instanceof TxCancelled && e.failed('like'))) throw e;
    }
    await dropPost(store, listenerId, episodeId);
  }
  const raw = rawPg(db);
  if (raw) await B.deleteEpisodeLike(raw, listenerId, episodeId);
}

export async function myLike(store: Store, _db: Db, listenerId: string, episodeId: string): Promise<{ liked: boolean; note?: string }> {
  const r = await get(store, 'main', K.episodeLike(listenerId, episodeId));
  return r ? { liked: true, ...(r['note'] ? { note: String(r['note']) } : {}) } : { liked: false };
}

/** The episode card of a like (lane LB's item), or undefined when the episode is unknown or its show is hidden. */
type Cards = Map<string, Item | null>;
async function loadEpisodes(store: Store, ids: Iterable<string>, cards: Cards): Promise<void> {
  const want = [...new Set(ids)].filter((id) => !cards.has(id));
  if (want.length === 0) return;
  const got = await batchGetAll(store, 'main', want.map((id) => K.episode(id)));
  const byId = new Map(got.map((e) => [String(e['id']), e]));
  for (const id of want) cards.set(id, byId.get(id) ?? null);
}

function toItem(l: Item, owner: Person, e: Item, withListener: boolean): LikeItem {
  return {
    ...(withListener ? { listener: { id: owner.id, displayName: owner.displayName, ...(owner.avatarUrl ? { avatarUrl: owner.avatarUrl } : {}) } } : {}),
    episode: {
      id: String(e['id']), feedUrl: String(e['feedUrl']), guid: String(e['guid']), title: String(e['title']), showTitle: String(e['showTitle'] ?? ''), enclosureUrl: String(e['enclosureUrl']),
      ...(e['imageUrl'] ? { imageUrl: String(e['imageUrl']) } : {}), ...(e['durationMs'] !== undefined && e['durationMs'] !== null ? { durationMs: Number(e['durationMs']) } : {}),
      ...(e['publishedAt'] ? { publishedAt: new Date(String(e['publishedAt'])).toISOString() } : {}),
    },
    ...(l['note'] ? { note: String(l['note']) } : {}),
    createdAt: String(l['createdAt']),
  };
}

/**
 * Up to `need` of one owner's likes, newest first, strictly before `before`, whose episode is known and whose show is
 * not hidden. Pages through the owner's time-ordered items until enough are kept or none are left.
 */
async function ownerLikes(store: Store, ownerId: string, before: string | undefined, need: number, hidden: ReadonlySet<string>, cards: Cards): Promise<Item[]> {
  const kept: Item[] = [];
  let start: Record<string, unknown> | undefined;
  const hi = before ? `ELIKET#${new Date(before).toISOString()}` : 'ELIKET#~';
  while (kept.length < need) {
    const out = await queryPage(store, 'main', {
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': K.L(ownerId), ':lo': 'ELIKET#', ':hi': hi },
      ConsistentRead: true, ScanIndexForward: false, Limit: need + 5, ...(start ? { ExclusiveStartKey: start } : {}),
    });
    const page = (out.Items ?? []) as Item[];
    await loadEpisodes(store, page.map((l) => String(l['episodeId'])), cards);
    for (const l of page) {
      const e = cards.get(String(l['episodeId']));
      if (e && !hidden.has(String(e['feedUrl']))) kept.push(l);
      if (kept.length >= need) break;
    }
    if (!out.LastEvaluatedKey) break;
    start = out.LastEvaluatedKey;
  }
  return kept;
}

function pageOf(rows: { l: Item; owner: Person }[], cards: Cards, withListener: boolean): { items: LikeItem[]; next?: string } {
  const slice = rows.slice(0, TIMELINE_PAGE);
  const last = slice[slice.length - 1];
  return {
    items: slice.map((r) => toItem(r.l, r.owner, cards.get(String(r.l['episodeId']))!, withListener)),
    ...(rows.length > TIMELINE_PAGE && last ? { next: String(last.l['createdAt']) } : {}),
  };
}

/** Likes from accounts the viewer follows, newest first, `before` an ISO time for the next page. */
export async function timeline(store: Store, db: Db, viewerId: string, before: string | undefined): Promise<{ items: LikeItem[]; next?: string }> {
  const [followed, blocked, muted, hidden] = await Promise.all([followedIds(db, viewerId), blockedEitherWay(db, viewerId), mutedIdsFor(db, viewerId), hiddenFeedUrls(db)]);
  const ppl = await people(store, followed);
  const cards: Cards = new Map();
  const rows: { l: Item; owner: Person }[] = [];
  for (const id of followed) {
    const owner = ppl.get(id);
    if (!visiblePerson(owner) || !publicLikes(owner) || blocked.has(id) || muted.has(id)) continue;
    for (const l of await ownerLikes(store, id, before, TIMELINE_PAGE + 1, hidden, cards)) rows.push({ l, owner });
  }
  rows.sort((a, b) => String(b.l['createdAt']).localeCompare(String(a.l['createdAt'])));
  return pageOf(rows.slice(0, TIMELINE_PAGE + 1), cards, true);
}

/** One account's likes: everyone sees them while likes are public; the account itself always does. */
export async function likesOf(store: Store, db: Db, ownerId: string, viewerId: string | undefined, before: string | undefined): Promise<{ items: LikeItem[]; next?: string }> {
  const owner = await person(store, ownerId);
  if (!visiblePerson(owner) || !(publicLikes(owner) || ownerId === viewerId)) return { items: [] };
  if (viewerId !== undefined && (await blockedEitherWay(db, viewerId)).has(ownerId)) return { items: [] };
  const cards: Cards = new Map();
  const rows = (await ownerLikes(store, ownerId, before, TIMELINE_PAGE + 1, await hiddenFeedUrls(db), cards)).map((l) => ({ l, owner }));
  return pageOf(rows, cards, false);
}

/** The like as the viewer may see it, or undefined (→ 404, never "it exists but is hidden"). */
export async function visibleLike(store: Store, db: Db, ownerId: string, episodeId: string, viewerId: string | undefined): Promise<LikeItem | undefined> {
  const [l, owner] = await Promise.all([get(store, 'main', K.episodeLike(ownerId, episodeId)), person(store, ownerId)]);
  if (!l || !visiblePerson(owner) || !(publicLikes(owner) || ownerId === viewerId)) return undefined;
  if (viewerId !== undefined && (await blockedEitherWay(db, viewerId)).has(ownerId)) return undefined;
  const e = await get(store, 'main', K.episode(episodeId));
  if (!e || (await hiddenFeedUrls(db)).has(String(e['feedUrl']))) return undefined;
  return toItem(l, owner, e, true);
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function likePost(store: Store, db: Db, ownerId: string, episodeId: string, viewerId: string | undefined): Promise<LikePost | undefined> {
  const like = await visibleLike(store, db, ownerId, episodeId, viewerId);
  if (!like) return undefined;
  const children = await partitionAll(store, K.LK(ownerId, episodeId));
  const blocked = viewerId !== undefined ? await blockedEitherWay(db, viewerId) : new Set<string>();
  const ppl = await people(store, children.map((c) => String(c['authorId'] ?? c['listenerId'])));
  const comments = children
    .filter((c) => String(c['SK']).startsWith('C#') && !c['deletedAt'] && visiblePerson(ppl.get(String(c['authorId']))) && !blocked.has(String(c['authorId'])))
    .sort((a, b) => cmp(String(a['createdAt']), String(b['createdAt'])) || cmp(String(a['id']), String(b['id'])))
    .slice(0, LIKE_COMMENTS_MAX)
    .map((c): LikeComment => {
      const a = ppl.get(String(c['authorId']))!;
      return { id: String(c['id']), author: { id: a.id, displayName: a.displayName, ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}) }, body: String(c['body']), createdAt: String(c['createdAt']), mine: c['authorId'] === viewerId };
    });
  const reactions = children.filter((c) => String(c['SK']).startsWith('R#'));
  const counts = new Map<string, number>();
  for (const r of reactions) if (visiblePerson(ppl.get(String(r['listenerId'])))) counts.set(String(r['emoji']), (counts.get(String(r['emoji'])) ?? 0) + 1);
  const mine = viewerId !== undefined ? reactions.find((r) => r['listenerId'] === viewerId) : undefined;
  return {
    like,
    comments,
    reactions: {
      counts: [...counts.entries()].sort((x, y) => y[1] - x[1] || cmp(x[0], y[0])).map(([emoji, n]) => ({ emoji, n })),
      ...(mine ? { mine: String(mine['emoji']) } : {}),
    },
  };
}

/** The like must still be there (the old foreign key to episode_likes). */
const likeExists = (ownerId: string, episodeId: string) => ({ key: K.episodeLike(ownerId, episodeId), condition: 'attribute_exists(PK)', label: 'like' });

export async function addLikeComment(store: Store, db: Db, ownerId: string, episodeId: string, authorId: string, body: string): Promise<LikeComment> {
  const id = randomUUID();
  const createdAt = nowIso(store);
  const key = K.likeComment(ownerId, episodeId, createdAt, id);
  const exists = likeExists(ownerId, episodeId);
  await tx(store)
    .check('main', exists.key, { condition: exists.condition, label: exists.label })
    .put('main', encode('likeComment', key, { id, ownerId, episodeId, authorId, body, createdAt }), { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('likeCommentPtr', K.likeCommentPtr(authorId, ownerId, episodeId, id), { ownerId, episodeId, id, sk: key.SK }))
    .commit();
  const raw = rawPg(db);
  if (raw) await B.insertLikeComment(raw, { id, ownerId, episodeId, authorId, body, createdAt });
  const a = await person(store, authorId);
  return { id, author: { id: authorId, displayName: a?.displayName ?? '', ...(a?.avatarUrl ? { avatarUrl: a.avatarUrl } : {}) }, body, createdAt, mine: true };
}

/** The author, or the like's owner, may delete a comment. True when one was deleted. */
export async function deleteLikeComment(store: Store, db: Db, ownerId: string, episodeId: string, commentId: string, viewerId: string): Promise<boolean> {
  const [c] = await prefixItems(store, K.LK(ownerId, episodeId), 'C#', { keep: (i) => i['id'] === commentId, max: 1 });
  if (!c || c['deletedAt'] || !(c['authorId'] === viewerId || ownerId === viewerId)) return false;
  const at = nowIso(store);
  try {
    await tx(store).update('main', keyOf(c), { update: 'SET #d = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#d)', names: { '#d': 'deletedAt' }, values: { ':at': at }, label: 'c' }).commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('c')) return false;
    throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.deleteLikeCommentRow(raw, commentId, at);
  return true;
}

export async function setLikeReaction(store: Store, db: Db, ownerId: string, episodeId: string, listenerId: string, emoji: string): Promise<void> {
  const at = nowIso(store);
  const exists = likeExists(ownerId, episodeId);
  await tx(store)
    .check('main', exists.key, { condition: exists.condition, label: exists.label })
    .put('main', encode('likeReaction', K.likeReaction(ownerId, episodeId, listenerId), { ownerId, episodeId, listenerId, emoji, createdAt: at }))
    .put('main', encode('likeReactionPtr', K.likeReactionPtr(listenerId, ownerId, episodeId), { ownerId, episodeId }))
    .commit();
  const raw = rawPg(db);
  if (raw) await B.upsertLikeReaction(raw, { ownerId, episodeId, listenerId, emoji, createdAt: at });
}

/** For lane SG's profile: how many episodes this listener liked (their `ELIKE#` items). */
export async function likesCountOf(store: Store, listenerId: string): Promise<number> {
  return (await prefixItems(store, K.L(listenerId), 'ELIKE#')).length;
}

export async function clearLikeReaction(store: Store, db: Db, ownerId: string, episodeId: string, listenerId: string): Promise<void> {
  await tx(store)
    .delete('main', K.likeReaction(ownerId, episodeId, listenerId))
    .delete('main', K.likeReactionPtr(listenerId, ownerId, episodeId))
    .commit();
  const raw = rawPg(db);
  if (raw) await B.deleteLikeReaction(raw, ownerId, episodeId, listenerId);
}
