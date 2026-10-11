// The Explore lists on DynamoDB: the New shows and Rising charts, the treasure hunt, the plaza, faces on picks.
/**
 * M26 lane DV (DV-20…DV-25). The charts are cached 5 minutes by their caller (`chart()`, lane LB's cache — the cache
 * entry is the chart's document); the hunt and the plaza are per viewer and live, as before.
 * - New shows / plaza / hunt candidates: the catalogue (src/jobs/charts.ts — every episode META, read through the G2
 *   index), grouped per show in code exactly as the SQL's GROUP BY / DISTINCT ON.
 * - Rising: the listen index for 14 days (EVERY listened row, private ones too — access-patterns finding 5, kept) plus
 *   top-level comments that are not deleted, removed or host-hidden (activity-stats.ts).
 * - Hunt plays: distinct listeners over 30 days from the listen index (no `hidden` filter either, as the SQL).
 * - Faces: the viewer's follows and blocks (their own partition, lanes SG and SF), the followed people's likes of
 *   each episode (lane SC's `ELIKE#` items, one BatchGet), their listener items for public likes / suspension.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import type { Store } from '../../../ddb/store.ts';
import { catalogueItems } from '../../../../jobs/charts.ts';
import { hiddenFeedUrls } from '../../safety/moderation.ts';
import { hiddenEpisodeIds } from '../../studio/hidden-episodes.ts';
import { cardOf, PLAZA_POOL, type ChartItem, type Face, type PlazaRow } from '../explore.ts';
import { commentItemsOf, recentTopComments } from './activity-stats.ts';
import { DAY_MS, epRowOf, episodesByIds, iso, listenersByIds, nowMs, partitionItems, showEpisodes, type EpRow } from './common.ts';
import { listensSince } from './listens.ts';

const CHART_STORED = 100;
const keyOf = (c: { feedUrl: string; guid: string }) => `${c.feedUrl}\u0001${c.guid}`;
const whenOf = (e: EpRow) => e.published_at ?? e.first_seen_at;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function catalogue(store: Store): Promise<EpRow[]> {
  return (await catalogueItems(store)).map(epRowOf);
}

/** "New shows": each show once, with its newest visible episode, newest first-episode first. */
export async function newShowsChart(store: Store, db: Db): Promise<ChartItem[]> {
  const [hidden, hiddenEps] = await Promise.all([hiddenFeedUrls(db), hiddenEpisodeIds(db)]);
  const shows = new Map<string, { first: string; latest?: EpRow }>();
  for (const e of await catalogue(store)) {
    const s = shows.get(e.feed_url) ?? shows.set(e.feed_url, { first: whenOf(e) }).get(e.feed_url)!;
    if (whenOf(e) < s.first) s.first = whenOf(e);
    if (hiddenEps.has(e.id)) continue; // M24 US11: a show's newest VISIBLE episode is its card
    // DISTINCT ON (feed_url) … ORDER BY COALESCE(published_at, first_seen_at) DESC, id
    if (!s.latest || whenOf(e) > whenOf(s.latest) || (whenOf(e) === whenOf(s.latest) && e.id < s.latest.id)) s.latest = e;
  }
  return [...shows.entries()]
    .filter(([feed, s]) => s.latest !== undefined && !hidden.has(feed))
    .sort(([fa, a], [fb, b]) => cmp(b.first, a.first) || cmp(fa, fb))
    .slice(0, CHART_STORED)
    .map(([, s], i) => {
      const card = cardOf(s.latest!);
      return { kind: 'trending' as const, key: keyOf(card), episode: card, reason: `New show · first episode ${new Date(s.first).toISOString().slice(0, 10)}`, rank: i + 1 };
    });
}

/** "Rising": listens + comments this week minus the week before; only growth, biggest first. */
export async function risingChart(store: Store, db: Db): Promise<ChartItem[]> {
  const now = nowMs(store);
  const since = iso(now - 14 * DAY_MS);
  const week = iso(now - 7 * DAY_MS);
  const g = new Map<string, { cur: number; prev: number }>();
  const add = (ep: string, at: string) => {
    const x = g.get(ep) ?? g.set(ep, { cur: 0, prev: 0 }).get(ep)!;
    if (at > week) x.cur++; else x.prev++;
  };
  for (const m of await listensSince(store, now - 14 * DAY_MS, now)) add(m.episodeId, m.at); // finding 5: hidden rows count here
  const tops = await recentTopComments(store, since);
  const items = await commentItemsOf(store, tops);
  for (const c of tops) {
    const it = items.get(c.id);
    if (!it || it['deletedAt'] || it['removedAt'] || it['hostHiddenAt']) continue;
    add(c.episodeId, String(it['createdAt']));
  }
  const grew = [...g.entries()].filter(([, x]) => x.cur > x.prev);
  const [eps, hidden, hiddenEps] = await Promise.all([episodesByIds(store, grew.map(([id]) => id)), hiddenFeedUrls(db), hiddenEpisodeIds(db)]);
  return grew
    .filter(([id]) => { const e = eps.get(id); return e !== undefined && !hidden.has(e.feed_url) && !hiddenEps.has(id); })
    .sort(([ia, a], [ib, b]) => (b.cur - b.prev) - (a.cur - a.prev) || b.cur - a.cur || cmp(ia, ib))
    .slice(0, CHART_STORED)
    .map(([id, x], i) => {
      const card = cardOf(eps.get(id)!);
      const up = x.cur - x.prev;
      return { kind: 'trending' as const, key: keyOf(card), episode: card, score: up, reason: `+${up} this week (${x.cur} vs ${x.prev})`, rank: i + 1 };
    });
}

/** The hunt's candidates: episodes with audio, not hidden, not from a show the viewer follows or turned down; bottom half by 30-day plays. */
export async function huntRows(store: Store, db: Db, listenerId: string | null): Promise<EpRow[]> {
  const now = nowMs(store);
  const plays = new Map<string, Set<string>>();
  for (const m of await listensSince(store, now - 30 * DAY_MS, now)) (plays.get(m.episodeId) ?? plays.set(m.episodeId, new Set()).get(m.episodeId)!).add(m.actorId);
  const [hidden, hiddenEps] = await Promise.all([hiddenFeedUrls(db), hiddenEpisodeIds(db)]);
  let subscribed = new Set<string>();
  const turnedDown = { shows: new Set<string>(), episodes: new Set<string>() };
  if (listenerId) {
    const [subs, dis] = await Promise.all([
      partitionItems(store, K.L(listenerId), { prefix: K.LISTENER_SK.subs }),
      partitionItems(store, K.L(listenerId), { prefix: K.DV_SK.dismissals }),
    ]);
    subscribed = new Set(subs.filter((s) => !s['deletedAt']).map((s) => String(s['feedUrl'])));
    for (const d of dis) (d['kind'] === 'show' ? turnedDown.shows : turnedDown.episodes).add(String(d['itemKey']));
  }
  const cand = (await catalogue(store))
    .filter((e) => e.enclosure_url !== '' && !hidden.has(e.feed_url) && !hiddenEps.has(e.id)
      && !subscribed.has(e.feed_url) && !turnedDown.shows.has(e.feed_url) && !turnedDown.episodes.has(e.id))
    .map((e) => ({ e, n: plays.get(e.id)?.size ?? 0 }))
    .sort((a, b) => a.n - b.n || cmp(a.e.id, b.e.id));
  const total = cand.length;
  return cand.filter((_, i) => (i + 1) * 2 <= total + 1).slice(0, 2000).map((x) => x.e);
}

type Agg = { feed: string; title?: { at: string; v: string }; image?: { at: string; v: string }; episodes: number; first: string };

function plazaOf(rows: readonly EpRow[]): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const e of rows) {
    const at = whenOf(e);
    const a = out.get(e.feed_url) ?? out.set(e.feed_url, { feed: e.feed_url, episodes: 0, first: at }).get(e.feed_url)!;
    a.episodes++;
    if (at < a.first) a.first = at;
    if (e.show_title !== null && (!a.title || at > a.title.at)) a.title = { at, v: e.show_title };
    if (e.image_url !== null && (!a.image || at > a.image.at)) a.image = { at, v: e.image_url };
  }
  return out;
}

const toPlaza = (a: Agg): PlazaRow => ({ feed_url: a.feed, title: a.title?.v ?? null, image_url: a.image?.v ?? null, episodes: a.episodes, first_at: a.first });

export async function plazaRows(store: Store, _db: Db): Promise<PlazaRow[]> {
  return [...plazaOf(await catalogue(store)).values()]
    .sort((a, b) => cmp(b.first, a.first) || cmp(a.feed, b.feed))
    .slice(0, PLAZA_POOL)
    .map(toPlaza);
}

export async function plazaRow(store: Store, _db: Db, feedUrl: string): Promise<PlazaRow | undefined> {
  const a = plazaOf(await showEpisodes(store, feedUrl)).get(feedUrl);
  return a ? toPlaza(a) : undefined;
}

export async function likedByFollowed(store: Store, _db: Db, viewerId: string, episodeIds: readonly string[]): Promise<Map<string, Face[]>> {
  const out = new Map<string, Face[]>();
  if (episodeIds.length === 0) return out;
  const own = await partitionItems(store, K.L(viewerId), { prefix: 'BLOCK' });
  const follows = (await partitionItems(store, K.L(viewerId), { prefix: K.LISTENER_SK.follows })).map((f) => String(f['SK']).slice('FOLLOW#'.length));
  const blocked = new Set(own.flatMap((b) => {
    const sk = String(b['SK']);
    return sk.startsWith('BLOCK#') ? [sk.slice('BLOCK#'.length)] : sk.startsWith('BLOCKEDBY#') ? [sk.slice('BLOCKEDBY#'.length)] : [];
  }));
  const who = follows.filter((id) => !blocked.has(id));
  if (who.length === 0) return out;
  const eps = [...new Set(episodeIds)];
  const likes = await batchGetAll(store, 'main', who.flatMap((id) => eps.map((ep) => K.episodeLike(id, ep))));
  const people = await listenersByIds(store, likes.map((l) => String(l['listenerId'])));
  const rows = likes
    .map((l) => ({ ep: String(l['episodeId']), at: String(l['createdAt']), p: people.get(String(l['listenerId'])) }))
    .filter((r) => r.p && !r.p['suspendedAt'] && !r.p['hiddenAt'] && r.p['likesPublic'] !== false)
    .sort((a, b) => cmp(b.at, a.at) || cmp(String(a.p!['id']), String(b.p!['id'])));
  for (const r of rows) {
    const list = out.get(r.ep) ?? [];
    if (list.length >= 3) continue;
    const avatar = r.p!['avatarUrl'];
    list.push({ id: String(r.p!['id']), displayName: String(r.p!['displayName']), ...(typeof avatar === 'string' && avatar ? { avatarUrl: avatar } : {}) });
    out.set(r.ep, list);
  }
  return out;
}
