// Mutes and muted notice threads on DynamoDB: items in the muter's own partition, so the whole set is one Query.
/**
 * M26 lane SG, SG-T06 (patterns SG-31…SG-38), data-model.md §3.
 *
 * - `L#<muter>/MUTE#<muted>` ({ otherId, createdAt }) — one-way and private (G-M21-6): only the muter's reads use it.
 *   No reverse item: nobody asks "who muted me" (the status push asks per follower with a GetItem).
 * - `L#<listener>/TMUTE#<kind>#<key>` ({ threadKind, threadKey, createdAt }) — notify() and pushFor() skip the thread.
 * - The social poll's mute stamp is the count and newest time of the MUTE# items — the same value the SQL stamped.
 * - The bridge writes `listener_mutes` / `muted_threads` too (lane SC's likes timeline and voice posts still read them).
 * - "Stop like notices" (`setLikeNotices`) writes lane SC's comment row and is not converted here.
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item } from '../../../ddb/store.ts';
import { aput, adel, getListener, partitionItems, unlessCondition } from '../../account/ddb/common.ts';
import type { MutedThread, ThreadKind } from '../muted-threads.ts';
import { commentsById, episodesById, iso, left, listenersById, nowMs, raw, type Hybrid } from './common.ts';

export async function mute(h: Hybrid, muterId: string, mutedId: string): Promise<'muted' | 'no_such_listener'> {
  if (!(await getListener(h, mutedId))) return 'no_such_listener';
  await unlessCondition(aput(h.store, 'main', encode('mute', K.mute(muterId, mutedId), { otherId: mutedId, createdAt: iso(nowMs(h)) }), { condition: 'attribute_not_exists(PK)' }));
  await raw(h)?.query('INSERT INTO listener_mutes (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [muterId, mutedId]);
  return 'muted';
}

export async function unmute(h: Hybrid, muterId: string, mutedId: string): Promise<void> {
  await adel(h.store, 'main', K.mute(muterId, mutedId));
  await raw(h)?.query('DELETE FROM listener_mutes WHERE muter_id = $1 AND muted_id = $2', [muterId, mutedId]);
}

async function muteItems(h: Hybrid, muterId: string): Promise<Item[]> {
  return partitionItems(h, K.L(muterId), K.SG_SK.mutes);
}

export async function mutedIdsFor(h: Hybrid, muterId: string): Promise<Set<string>> {
  return new Set((await muteItems(h, muterId)).map((m) => String(m['otherId'])));
}

export async function isMuted(h: Hybrid, muterId: string, mutedId: string): Promise<boolean> {
  return Boolean(await get(h.store, 'main', K.mute(muterId, mutedId)));
}

export async function listMutes(h: Hybrid, muterId: string): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  const ms = (await muteItems(h, muterId)).sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])));
  const ls = await listenersById(h.store, ms.map((m) => String(m['otherId'])));
  return ms.flatMap((m) => {
    const l = ls.get(String(m['otherId']));
    return l ? [{ id: String(l['id']), name: String(l['displayName']), avatarUrl: (l['avatarUrl'] as string | undefined) ?? null }] : [];
  });
}

/** Part of the social poll's ETag: a mute or an unmute changes the muter's answer (count + newest). */
export async function muteStamp(h: Hybrid, muterId: string): Promise<string> {
  const ms = await muteItems(h, muterId);
  const newest = ms.reduce<string | null>((m, x) => (m === null || String(x['createdAt']) > m ? String(x['createdAt']) : m), null);
  return `${ms.length}:${newest ?? '-'}`;
}

// ---- muted notice threads (M22 US3) ----

export async function muteThread(h: Hybrid, listenerId: string, kind: ThreadKind, key: string): Promise<void> {
  await unlessCondition(aput(h.store, 'main', encode('threadMute', K.mutedThread(listenerId, kind, key), { threadKind: kind, threadKey: key, createdAt: iso(nowMs(h)) }), { condition: 'attribute_not_exists(PK)' }));
  await raw(h)?.query('INSERT INTO muted_threads (listener_id, thread_kind, thread_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [listenerId, kind, key]);
}

export async function unmuteThread(h: Hybrid, listenerId: string, kind: ThreadKind, key: string): Promise<void> {
  await adel(h.store, 'main', K.mutedThread(listenerId, kind, key));
  await raw(h)?.query('DELETE FROM muted_threads WHERE listener_id = $1 AND thread_kind = $2 AND thread_key = $3', [listenerId, kind, key]);
}

export async function isThreadMuted(h: Hybrid, listenerId: string, kind: string, key: string): Promise<boolean> {
  return Boolean(await get(h.store, 'main', K.mutedThread(listenerId, kind, key)));
}

/** My muted threads, newest first (≤ 200), each titled by the comment's words or the liked episode's title. */
export async function listMutedThreads(h: Hybrid, listenerId: string): Promise<MutedThread[]> {
  const ts = (await partitionItems(h, K.L(listenerId), K.SG_SK.threadMutes))
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt']))).slice(0, 200);
  const comments = await commentsById(h, ts.filter((x) => x['threadKind'] === 'comment').map((x) => String(x['threadKey'])));
  const eps = await episodesById(h.store, ts.filter((x) => x['threadKind'] === 'like_post').map((x) => String(x['threadKey']).slice(37)));
  return ts.map((x) => {
    const kind = x['threadKind'] as ThreadKind;
    const key = String(x['threadKey']);
    const c = kind === 'comment' ? comments.get(key) : undefined;
    const body = c && c.deleted_at === null && c.removed_at === null && c.body !== null ? left(c.body, 80) : null;
    const title = kind === 'like_post' ? (eps.get(key.slice(37))?.['title'] as string | undefined) : undefined;
    return {
      threadKind: kind, threadKey: key,
      title: kind === 'comment' ? (body ? `Comment: ${body}` : 'A comment') : (title ? `Like: ${title}` : 'A like'),
      createdAt: new Date(String(x['createdAt'])).toISOString(),
    };
  });
}
