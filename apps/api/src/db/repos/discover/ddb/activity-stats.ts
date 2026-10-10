// "Listened and talked about" on DynamoDB: listens from the listen index, comments, clips and reactions from each listener's own items.
/**
 * M26 lane DV (DV-01). Counts only, never names (guard G6).
 * - Listens: the listen index's day partitions (listens.ts) for the window; public rows only (`hidden = false`, G2).
 * - Comments, clips, reactions: there is no global "by time" key for them, so every listener's own index is read
 *   (lane AC's `Q#listeners`, then per listener `CMT#`/`CLP#` ranges from the window's start and `REACT#` with a time
 *   filter — lane SC's items). The answer is cached by every caller (Discover 1 h, the chart 5 min, next-up 1 h).
 *   Scale limit, stated: 3 small Queries per listener per cache miss — fine at hundreds of listeners; past
 *   ≈ 5 000 listeners this should become day buckets written with the comment (lane SC's transaction).
 */
import type { ActivityRow } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import { hiddenEpisodeIds } from '../../studio/hidden-episodes.ts';
import { allListeners, DAY_MS, iso, mapLimit, nowMs, partitionItems, showEpisodes } from './common.ts';
import { listensSince } from './listens.ts';

export const FAN_OUT = 16;

/** A top-level comment's author-index entry (lane SC's `L#<author>/CMT#…`). */
export type TopComment = { id: string; episodeId: string; sk: string; authorId: string; createdAt: string };

/**
 * Every top-level comment made after `sinceIso` (by its stored time), from each listener's own index. `authors`
 * limits it to some listeners (e.g. not suspended); default every listener.
 */
export async function recentTopComments(store: Store, sinceIso: string, authors?: readonly Item[]): Promise<TopComment[]> {
  const who = authors ?? await allListeners(store);
  const parts = await mapLimit(who, FAN_OUT, async (l) => {
    const id = String(l['id']);
    const items = await partitionItems(store, K.L(id), { from: `CMT#${sinceIso}`, to: 'CMT#~' });
    return items.filter((i) => !i['parentId'] && String(i['createdAt']) > sinceIso)
      .map((i) => ({ id: String(i['id']), episodeId: String(i['episodeId']), sk: String(i['sk']), authorId: id, createdAt: String(i['createdAt']) }));
  });
  return parts.flat();
}

/** The comment items behind author-index entries (a gone one is left out). */
export async function commentItemsOf(store: Store, refs: readonly { episodeId: string; sk: string }[]): Promise<Map<string, Item>> {
  const out = new Map<string, Item>();
  if (refs.length === 0) return out;
  for (const it of await batchGetAll(store, 'main', refs.map((r) => ({ PK: K.EP(r.episodeId), SK: r.sk })), { consistent: false })) {
    if (it['t'] === 'comment') out.set(String(it['id']), it);
  }
  return out;
}

type Acc = { listeners: Set<string>; comments: number; clips: number; reactions: number; newest: string };

export async function talkedAbout(store: Store, db: Db, sinceDays = 7, feedUrl?: string): Promise<(ActivityRow & { episodeId: string })[]> {
  const now = nowMs(store);
  const sinceMs = now - sinceDays * DAY_MS;
  const since = iso(sinceMs);
  const acc = new Map<string, Acc>();
  const of = (ep: string): Acc => acc.get(ep) ?? acc.set(ep, { listeners: new Set(), comments: 0, clips: 0, reactions: 0, newest: '' }).get(ep)!;
  const bump = (a: Acc, at: string) => { if (at > a.newest) a.newest = at; };

  for (const m of await listensSince(store, sinceMs, now)) {
    if (m.hidden) continue; // G2: a private listener counts nowhere
    const a = of(m.episodeId);
    a.listeners.add(m.actorId);
    bump(a, m.at);
  }
  const listeners = await allListeners(store);
  const tops = await recentTopComments(store, since, listeners);
  const items = await commentItemsOf(store, tops);
  for (const c of tops) {
    const it = items.get(c.id);
    // Not deleted by the author (a placeholder leaves the author's index), not hidden by the host; a removed one still counts (as the SQL).
    if (!it || it['deletedAt'] || it['hostHiddenAt']) continue;
    const a = of(c.episodeId);
    a.comments++;
    bump(a, String(it['createdAt']));
  }
  await mapLimit(listeners, FAN_OUT, async (l) => {
    const id = String(l['id']);
    const [clips, reactions] = await Promise.all([
      partitionItems(store, K.L(id), { from: `CLP#${since}`, to: 'CLP#~' }),
      partitionItems(store, K.L(id), { prefix: 'REACT#', filter: { expr: '#c > :s', names: { '#c': 'createdAt' }, values: { ':s': since } } }),
    ]);
    for (const c of clips) {
      if (c['deletedAt'] || String(c['createdAt']) <= since) continue;
      const a = of(String(c['episodeId']));
      a.clips++;
      bump(a, String(c['createdAt']));
    }
    for (const r of reactions) {
      const a = of(String(r['episodeId']));
      a.reactions++;
      bump(a, String(r['createdAt']));
    }
  });

  // M24 US11: hidden episodes leave this list; the per-feed variant (next-up) keeps only that show's episodes.
  const hidden = await hiddenEpisodeIds(db);
  const onFeed = feedUrl === undefined ? undefined : new Set((await showEpisodes(store, feedUrl)).map((e) => e.id));
  const out: (ActivityRow & { episodeId: string })[] = [];
  for (const [episodeId, a] of acc) {
    if (hidden.has(episodeId) || (onFeed && !onFeed.has(episodeId))) continue;
    if (a.listeners.size + a.comments + a.clips + a.reactions === 0) continue;
    out.push({ key: episodeId, episodeId, listeners: a.listeners.size, comments: a.comments, clips: a.clips, reactions: a.reactions, newestAt: a.newest ? Date.parse(a.newest) : 0 });
  }
  return out;
}
