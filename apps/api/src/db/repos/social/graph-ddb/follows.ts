// Follows on DynamoDB: both directions and both counters in one transaction, the lists read from the listener's own partition.
/**
 * M26 lane SG, SG-T01 (patterns SG-01…SG-09), data-model.md §3 and "Lane SG changes".
 *
 * - `L#<follower>/FOLLOW#<followed>` and `L#<followed>/FOLLOWER#<follower>` ({ otherId, createdAt }) are written in ONE
 *   TransactWriteItems with `followingCount` / `followerCount` on both listener items (lane AC's `addFollowCount`).
 *   Each edge is conditional (`attribute_not_exists` on follow, `attribute_exists` on unfollow), so a repeat or a race
 *   never moves a counter twice: counts always equal the edges (guard G-M26-SG1). A cancelled transaction
 *   (TransactionConflict) wrote nothing and is retried whole.
 * - A new follow's notice (lane SG notifications) rides in the same transaction, and its fan-out work (backfill of
 *   the following feed and friends listening) is an outbox entry in it too (`sg:follow`); unfollow enqueues `sg:unfollow`.
 * - The lists (followers / following) Query the listener's own edges — strongly consistent, no GSI — and sort by
 *   `createdAt` in code. Scale limit, stated: every edge of one listener is read per list page (≈ 10 000 edges per 1 MB).
 * - The per-viewer counts (M16a G-B2) are the stored counters minus the viewer's blocked listeners found among the edges.
 * - The bridge writes the Postgres `follows` row too (chat, likes, voice posts, discover still JOIN it).
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { get, type Item } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { isConflict, withRetry } from '../../../ddb/retry.ts';
import { enqueue } from '../../../../jobs/outbox.ts';
import { getListener, partitionItems, txa } from '../../account/ddb/common.ts';
import { addFollowCount } from '../../account/ddb/listeners.ts';
import type { ListenerLite } from '../follows.ts';
import { blockedBy, blockedEitherWay, hasBlocked, iso, listenersById, nowMs, raw, type Hybrid } from './common.ts';
import { planNotice } from './notifications.ts';

/** How many times a cancelled (conflicting) follow transaction is tried in all. */
const TRIES = 8;
/** More followers than this: the account's activity is not fanned out, it is merged at read time (data-model §9). */
export const FANOUT_MAX = 2000;

const edgeOf = (it: Item) => ({ id: String(it['otherId']), createdAt: String(it['createdAt']) });

/** The listener's edges of one direction (strongly consistent). */
export async function edges(h: Hybrid, listenerId: string, dir: 'following' | 'followers'): Promise<{ id: string; createdAt: string }[]> {
  return (await partitionItems(h, K.L(listenerId), dir === 'following' ? K.LISTENER_SK.follows : K.LISTENER_SK.followers)).map(edgeOf);
}

/** Who `listenerId` follows. */
export async function followSet(h: Hybrid, listenerId: string): Promise<Set<string>> {
  return new Set((await edges(h, listenerId, 'following')).map((e) => e.id));
}

export async function follow(h: Hybrid, followerId: string, followedId: string): Promise<'followed' | 'self' | 'no_such_listener' | 'blocked'> {
  if (followerId === followedId) return 'self';
  if (!(await getListener(h, followedId))) return 'no_such_listener';
  // M6 (FR-008): no follow across a block, in either direction (blocks are lane SF's, still on Postgres).
  if ((await hasBlocked(h, followerId, followedId)) || (await hasBlocked(h, followedId, followerId))) return 'blocked';
  await addEdge(h, followerId, followedId);
  return 'followed';
}

/** One transaction: both edges, both counters, the outbox entry and — the first time only — the notice. True when new. */
export async function addEdge(h: Hybrid, followerId: string, followedId: string): Promise<boolean> {
  let notice = true;
  const added = await withRetry(async () => {
    const createdAt = iso(nowMs(h));
    const t = txa(h.store)
      .put('main', encode('follow', K.follow(followerId, followedId), { otherId: followedId, createdAt }), { condition: 'attribute_not_exists(PK)', label: 'edge' })
      .put('main', encode('follower', K.follower(followedId, followerId), { otherId: followerId, createdAt }), { condition: 'attribute_not_exists(PK)', label: 'edge' });
    addFollowCount(t, followerId, 'followingCount', 1, 'listener');
    addFollowCount(t, followedId, 'followerCount', 1, 'listener');
    enqueue(t.raw, h.store, { kind: 'sg:follow', payload: { followerId, followedId } });
    // M21 US10 (G-M21-9): a new follow tells the followed listener — in the same transaction.
    const plan = notice ? await planNotice(h, { recipientId: followedId, actorId: followerId, kind: 'follow' }) : undefined;
    plan?.add(t);
    try {
      await t.commit();
    } catch (e) {
      if (e instanceof TxCancelled && e.failed('edge')) return false; // already following: nothing changed
      if (e instanceof TxCancelled && e.failed('listener')) return false; // an account went meanwhile
      if (e instanceof TxCancelled && e.failed('notice')) { notice = false; throw Object.assign(new Error('notice raced'), { name: 'TransactionConflictException' }); }
      throw e;
    }
    await plan?.after();
    return true;
  }, { tries: TRIES, retryOn: isConflict });
  const pg = raw(h);
  if (added && pg) await pg.query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [followerId, followedId]);
  if (added) await markBigActor(h, followedId);
  return added;
}

export async function unfollow(h: Hybrid, followerId: string, followedId: string): Promise<void> {
  await removeEdge(h, followerId, followedId);
}

/** The mirror of `addEdge`. True when an edge was removed. */
export async function removeEdge(h: Hybrid, followerId: string, followedId: string): Promise<boolean> {
  const removed = await withRetry(async () => {
    const t = txa(h.store)
      .delete('main', K.follow(followerId, followedId), { condition: 'attribute_exists(PK)', label: 'edge' })
      .delete('main', K.follower(followedId, followerId), { condition: 'attribute_exists(PK)', label: 'edge' });
    addFollowCount(t, followerId, 'followingCount', -1, 'listener');
    addFollowCount(t, followedId, 'followerCount', -1, 'listener');
    enqueue(t.raw, h.store, { kind: 'sg:unfollow', payload: { followerId, followedId } });
    try {
      await t.commit();
    } catch (e) {
      if (e instanceof TxCancelled && (e.failed('edge') || e.failed('listener'))) return false; // was not following
      throw e;
    }
    return true;
  }, { tries: TRIES, retryOn: isConflict });
  const pg = raw(h);
  if (pg) await pg.query('DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2', [followerId, followedId]);
  if (removed) await markBigActor(h, followedId);
  return removed;
}

/** SF's block ends follows both ways (blocks.ts `block`): lane SF calls this when it moves. */
export async function endFollowsBetween(h: Hybrid, a: string, b: string): Promise<void> {
  await removeEdge(h, a, b);
  await removeEdge(h, b, a);
}

/** Keeps the `BIGACTOR` marker (G4 `Q#bigactors`) in step with the follower count: above FANOUT_MAX the feed merges on read. */
async function markBigActor(h: Hybrid, id: string): Promise<void> {
  const l = await getListener(h, id);
  const big = Number(l?.['followerCount'] ?? 0) > FANOUT_MAX;
  const has = Boolean(await get(h.store, 'main', K.bigActor(id)));
  if (big === has) return;
  const t = txa(h.store);
  if (big) t.put('main', encode('bigActor', K.bigActor(id), { since: iso(nowMs(h)) }, { gsi: K.G4('bigactors', iso(nowMs(h)), id) }));
  else t.delete('main', K.bigActor(id));
  await t.commit();
}

export async function isFollowing(h: Hybrid, followerId: string, followedId: string): Promise<boolean> {
  return Boolean(await get(h.store, 'main', K.follow(followerId, followedId)));
}

/** M16a bug 2 (FR-003): the stored counters minus listeners the viewer blocked — the lists' own rule. */
export async function counts(h: Hybrid, listenerId: string, viewerId?: string): Promise<{ followers: number; following: number }> {
  const l = await getListener(h, listenerId);
  let followers = Number(l?.['followerCount'] ?? 0);
  let following = Number(l?.['followingCount'] ?? 0);
  if (viewerId) {
    const blocked = [...(await blockedBy(h, viewerId))];
    if (blocked.length > 0) {
      const found = await batchGetAll(h.store, 'main', blocked.flatMap((b) => [K.follower(listenerId, b), K.follow(listenerId, b)]));
      for (const it of found) {
        if (String(it['SK']).startsWith(K.LISTENER_SK.followers)) followers--;
        else following--;
      }
    }
  }
  return { followers: Math.max(0, followers), following: Math.max(0, following) };
}

type Page = { listeners: ListenerLite[]; next?: string };

/** M21 US8 (FR-074): newest first, `before` = the previous page's last `createdAt`; bio and (signed in) `youFollow`. */
async function page(h: Hybrid, listenerId: string, dir: 'following' | 'followers', before: string | undefined, limit: number, viewerId: string | undefined): Promise<Page> {
  const cut = before !== undefined && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : undefined;
  const blocked = viewerId ? await blockedBy(h, viewerId) : new Set<string>();
  const all = (await edges(h, listenerId, dir))
    .filter((e) => (cut === undefined || e.createdAt < cut) && !blocked.has(e.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const rows: { id: string; createdAt: string; l: Item }[] = [];
  for (let i = 0; i < all.length && rows.length <= limit; i += 100) {
    const chunk = all.slice(i, i + 100);
    const ls = await listenersById(h.store, chunk.map((e) => e.id));
    for (const e of chunk) {
      const l = ls.get(e.id);
      if (l) rows.push({ ...e, l }); // the old JOIN listeners: a deleted account is not listed
      if (rows.length > limit) break;
    }
  }
  const slice = rows.slice(0, limit);
  const mine = viewerId ? new Set((await batchGetAll(h.store, 'main', slice.map((r) => K.follow(viewerId, r.id)))).map((it) => String(it['otherId']))) : undefined;
  return {
    listeners: slice.map((r) => {
      const avatar = r.l['avatarUrl'] as string | undefined;
      const bio = r.l['bio'] as string | undefined;
      return {
        id: r.id, displayName: (r.l['displayName'] as string | undefined) ?? null, ...(avatar ? { avatarUrl: avatar } : {}),
        ...(bio ? { bio } : {}), ...(mine ? { youFollow: mine.has(r.id) } : {}),
      };
    }),
    ...(rows.length > limit ? { next: new Date(slice[slice.length - 1]!.createdAt).toISOString() } : {}),
  };
}

export const followers = (h: Hybrid, listenerId: string, before?: string, limit = 50, viewerId?: string): Promise<Page> => page(h, listenerId, 'followers', before, limit, viewerId);
export const following = (h: Hybrid, listenerId: string, before?: string, limit = 50, viewerId?: string): Promise<Page> => page(h, listenerId, 'following', before, limit, viewerId);

/** SG-09: follows this listener made in the last minute (the 60-a-minute floor). */
export async function recentFollowRows(h: Hybrid, followerId: string): Promise<{ n: number }[]> {
  const since = iso(nowMs(h) - 60_000);
  return [{ n: (await edges(h, followerId, 'following')).filter((e) => e.createdAt > since).length }];
}

/** PUT /v1/listeners/:id/follow: on DynamoDB the follow is one transaction already. */
export const followInTx = (h: Hybrid, followerId: string, followedId: string) => follow(h, followerId, followedId);

/** AC's status push (foreign.ts `statusFollowers`): followers of an author, minus blocks either way and followers who muted the author. */
export async function statusFollowerIds(h: Hybrid, authorId: string): Promise<string[]> {
  const blocked = await blockedEitherWay(h, authorId);
  const ids = (await edges(h, authorId, 'followers')).map((e) => e.id).filter((id) => id !== authorId && !blocked.has(id));
  if (ids.length === 0) return [];
  const muting = new Set((await batchGetAll(h.store, 'main', ids.map((id) => K.mute(id, authorId)))).map((it) => String(it['PK']).slice(2)));
  return ids.filter((id) => !muting.has(id));
}
