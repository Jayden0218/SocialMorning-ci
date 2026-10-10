// For You's reads on DynamoDB: the listener's own items for the context, and each channel's episodes by show or by category.
/**
 * M26 lane DV, DV-T02 (patterns DV-35…DV-44). Scoring, mixing and the serve-time rules stay in foryou.ts, shared by
 * both backends; only the reads differ:
 * - context: live subscriptions (`SUB#`), finished positions (`POS#` + the episodes' show), follows (`FOLLOW#`) — all
 *   the listener's own partition, strongly read; top categories from their own `listened` activity (`ACT#`, lane SG)
 *   and the episodes' `genreId`; fatigue from their recommendation events in the window (`RE#`, lane LB) — distinct
 *   UTC days with an impression, only for episodes never opened.
 * - sub-new / show CF: each show's G2 partition newest first (common.ts `showEpisodes`), merged.
 * - social: each followed listener's public activity in the window (`ACT#<actor>` from the window's start), counted
 *   per episode (distinct people).
 * - category / interests: G3 `GENREEPS#<genre>` newest first; interests keep each show's newest one (the SQL's
 *   DISTINCT ON), then the newest INTERESTS_CAP. An episode without a publish date is not in G3 (lane LB writes G3
 *   only with a date): the SQL put those last, so they only ever filled a list shorter than its cap.
 * The whole list is cached 30 minutes per listener (the caller), so these reads happen once per cache miss.
 */
import { CHANNEL_CAP } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Store } from '../../../ddb/store.ts';
import { FATIGUE_WINDOW_DAYS, INTERESTS_CAP, SOCIAL_WINDOW_DAYS, TOP_GENRES, type ContextRows, type Row } from '../foryou.ts';
import { DAY_MS, episodesByIds, iso, mapLimit, nowMs, partitionItems, showEpisodes, type EpRow } from './common.ts';

const asRow = (e: EpRow): Row => ({
  id: e.id, feed_url: e.feed_url, guid: e.guid, title: e.title, show_title: e.show_title, image_url: e.image_url, duration_ms: e.duration_ms,
  enclosure_url: e.enclosure_url, published_at: e.published_at, genre_id: e.genre_id,
});

/** `ORDER BY published_at DESC NULLS LAST` (ties: id, for a stable answer). */
const byPublished = (a: { published_at: string | null; id: string }, b: { published_at: string | null; id: string }) => {
  if (a.published_at !== b.published_at) {
    if (a.published_at === null) return 1;
    if (b.published_at === null) return -1;
    return a.published_at < b.published_at ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export async function contextRows(store: Store, _db: Db, listenerId: string): Promise<ContextRows> {
  const now = nowMs(store);
  const [subs, pos, follows, acts, recs] = await Promise.all([
    partitionItems(store, K.L(listenerId), { prefix: K.LISTENER_SK.subs }),
    partitionItems(store, K.L(listenerId), { prefix: K.LISTENER_SK.positions, filter: { expr: '#f = :t', names: { '#f': 'finished' }, values: { ':t': true } } }),
    partitionItems(store, K.L(listenerId), { prefix: K.LISTENER_SK.follows }),
    queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk', FilterExpression: '#k = :l', ExpressionAttributeNames: { '#k': 'kind' },
      ExpressionAttributeValues: { ':pk': `ACT#${listenerId}`, ':l': 'listened' }, ConsistentRead: true,
    }),
    queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk AND SK > :from', ExpressionAttributeValues: { ':pk': `RE#${listenerId}`, ':from': iso(now - FATIGUE_WINDOW_DAYS * DAY_MS) }, ConsistentRead: true,
    }),
  ]);
  const eps = await episodesByIds(store, [...pos.map((p) => String(p['episodeId'])), ...acts.items.map((a) => String(a['episodeId']))]);
  const genreCount = new Map<number, number>();
  for (const a of acts.items) {
    const g = eps.get(String(a['episodeId']))?.genre_id;
    if (g !== null && g !== undefined) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  }
  const since = iso(now - FATIGUE_WINDOW_DAYS * DAY_MS);
  const fat = new Map<string, { days: Set<string>; opened: boolean }>();
  for (const r of recs.items) {
    if (String(r['at']) <= since) continue;
    const f = fat.get(String(r['episodeId'])) ?? fat.set(String(r['episodeId']), { days: new Set(), opened: false }).get(String(r['episodeId']))!;
    if (r['kind'] === 'open') f.opened = true;
    if (r['kind'] === 'impression') f.days.add(String(r['at']).slice(0, 10));
  }
  return {
    subs: subs.filter((s) => !s['deletedAt']).map((s) => String(s['feedUrl'])),
    fin: pos.map((p) => ({ episode_id: String(p['episodeId']), feed_url: eps.get(String(p['episodeId']))?.feed_url ?? null })),
    follows: follows.map((f) => String(f['SK']).slice('FOLLOW#'.length)),
    genres: [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_GENRES).map(([g]) => g),
    fatigue: [...fat.entries()].filter(([, f]) => !f.opened).map(([episode_id, f]) => ({ episode_id, imps: f.days.size })),
  };
}

export async function newestOfShows(store: Store, _db: Db, feedUrls: readonly string[], limit: number): Promise<Row[]> {
  const lists = await mapLimit([...new Set(feedUrls)], 8, (f) => showEpisodes(store, f, { max: limit }));
  return lists.flat().map(asRow).sort(byPublished).slice(0, limit);
}

export async function socialRows(store: Store, _db: Db, follows: readonly string[], blocked: readonly string[]): Promise<(Row & { n: number })[]> {
  const since = iso(nowMs(store) - SOCIAL_WINDOW_DAYS * DAY_MS);
  const out = new Map<string, Set<string>>();
  const skip = new Set(blocked);
  await mapLimit(follows.filter((a) => !skip.has(a)), 8, async (actor) => {
    const { items } = await queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk AND SK > :from', FilterExpression: '#h = :f', ExpressionAttributeNames: { '#h': 'hidden' },
      ExpressionAttributeValues: { ':pk': `ACT#${actor}`, ':from': since, ':f': false }, ConsistentRead: true,
    });
    for (const a of items) if (String(a['createdAt']) > since) (out.get(String(a['episodeId'])) ?? out.set(String(a['episodeId']), new Set()).get(String(a['episodeId']))!).add(actor);
  });
  const eps = await episodesByIds(store, [...out.keys()]);
  return [...out.entries()]
    .flatMap(([id, who]) => { const e = eps.get(id); return e ? [{ ...asRow(e), n: who.size }] : []; })
    .sort((a, b) => b.n - a.n || byPublished(a, b))
    .slice(0, CHANNEL_CAP.social);
}

/** Episode ids of one category, newest first (G3), up to `max` (or `maxShows` distinct shows). */
async function genreIds(store: Store, genreId: number, opts: { max?: number; maxShows?: number }): Promise<{ id: string; feedKey: string }[]> {
  const seen = new Set<string>();
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G3, KeyConditionExpression: 'G3PK = :g', ExpressionAttributeValues: { ':g': `GENREEPS#${genreId}` }, ScanIndexForward: false,
  }, {
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    ...(opts.maxShows !== undefined ? { keep: (i) => { const f = String(i['feedKey']); if (seen.has(f) || seen.size >= opts.maxShows!) return false; seen.add(f); return true; } } : {}),
  });
  return items.map((i) => ({ id: String(i['PK']).slice('EP#'.length), feedKey: String(i['feedKey']) }));
}

export async function genreRows(store: Store, _db: Db, genres: readonly number[]): Promise<Row[]> {
  const ids = (await mapLimit([...new Set(genres)], 4, (g) => genreIds(store, g, { max: CHANNEL_CAP.genre }))).flat();
  const eps = await episodesByIds(store, ids.map((x) => x.id));
  return [...eps.values()].map(asRow).sort(byPublished).slice(0, CHANNEL_CAP.genre);
}

export async function interestRows(store: Store, _db: Db, picked: readonly number[]): Promise<Row[]> {
  // Each category's newest INTERESTS_CAP shows (one episode each — its newest there) hold the overall newest INTERESTS_CAP.
  const ids = (await mapLimit([...new Set(picked)], 4, (g) => genreIds(store, g, { maxShows: INTERESTS_CAP }))).flat();
  const eps = [...(await episodesByIds(store, ids.map((x) => x.id))).values()].map(asRow);
  const newestPerShow = new Map<string, Row>();
  for (const e of eps.sort(byPublished)) if (!newestPerShow.has(e.feed_url)) newestPerShow.set(e.feed_url, e);
  return [...newestPerShow.values()].sort(byPublished).slice(0, INTERESTS_CAP);
}
