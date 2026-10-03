// Builds the Discover page: daily picks, talked-about episodes and the chart, cached hourly.
/**
 * The Discover payload (M5 US1, research R3/R4): today's picks resolved through their
 * feeds, "listened and talked about" from the app's own aggregates, the all-genres
 * chart's latest episodes as the filler. Computed on demand, cached 1 h. Every card is
 * registered as an M3 episode. Nothing here names a listener (guard G6).
 */
import { fillWithTrending, picksForDay, rankTalkedAbout, type PickIn } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { hiddenFeedUrls } from '../safety/moderation.ts';
import { cached, TTL } from '../cache.ts';
import { talkedAbout } from './activity-stats.ts';
import { fetchFeed, registerCard, toCard } from '../../../catalog/feed.ts';
import { latestEpisodes, topShows, type EpisodeCard, type ShowCard } from '../../../catalog/apple.ts';

/** M10: counts only, never names (guard G6). */
export type ItemStats = { listeners: number; comments: number };
export type DiscoverItem = { kind: 'pick' | 'talkedAbout' | 'trending'; key: string; episode: EpisodeCard & { id: string }; why?: string; reason?: string; score?: number; date?: string; stats?: ItemStats };
export type NewShow = { show: ShowCard; episode: EpisodeCard & { id: string } };
/**
 * `shows` and `newShows` (M10) are optional so a body cached before M10 still reads.
 * `shows` is stored at up to SHOWS_STORED so hiding one still leaves six to serve.
 */
export type DiscoverBody = { date?: string; picks: DiscoverItem[]; talkedAbout: DiscoverItem[]; trending: DiscoverItem[]; shows?: ShowCard[]; newShows?: NewShow[]; warnings: string[] };

/** M10 caps. The chart is read once at CHART_LIMIT; trending still walks only the first TRENDING_SHOWS, as it did at limit 10. */
export const CHART_LIMIT = 25;
const TRENDING_SHOWS = 10;
export const SHOWS_SERVED = 6;
const SHOWS_STORED = 12;
export const NEW_SHOW_MAX_EPISODES = 12;
const NEW_SHOWS = 3;
const NEW_SHOW_EXTRA_CALLS = 3;

const keyOf = (c: EpisodeCard) => `${c.feedUrl}\u0001${c.guid}`;

/**
 * M6 (FR-014, G7): a show the owner hid leaves every discovery list at once — applied to
 * the cached body at serve time, so it does not wait for the hour's cache to expire.
 */
export function excludeHidden(body: DiscoverBody, hidden: ReadonlySet<string>): DiscoverBody {
  if (hidden.size === 0) return body;
  const keep = (i: DiscoverItem) => !hidden.has(i.episode.feedUrl);
  return {
    ...body, picks: body.picks.filter(keep), talkedAbout: body.talkedAbout.filter(keep), trending: body.trending.filter(keep),
    ...(body.shows ? { shows: body.shows.filter((s) => !hidden.has(s.feedUrl)) } : {}),
    ...(body.newShows ? { newShows: body.newShows.filter((n) => !hidden.has(n.show.feedUrl) && !hidden.has(n.episode.feedUrl)) } : {}),
  };
}

export const discoverCacheKey = (day: string) => `discover:v3:${day}`;

/** M15 T014: drop every cached Discover body (all days), so the next request rebuilds with the saved picks. */
export async function dropDiscoverCache(db: Db): Promise<void> {
  await db.query("DELETE FROM cache WHERE key LIKE 'discover:v3:%' OR (key LIKE 'foryou:%' AND key <> 'foryou:chart')");
}

export async function discoverBody(db: Db, f: typeof fetch, picks: readonly PickIn[], today: string): Promise<{ body: DiscoverBody; stale: boolean }> {
  const r = await cachedDiscover(db, f, picks, today);
  return { body: excludeHidden(r.body, await hiddenFeedUrls(db)), stale: r.stale };
}

async function cachedDiscover(db: Db, f: typeof fetch, picks: readonly PickIn[], today: string): Promise<{ body: DiscoverBody; stale: boolean }> {
  // M10: a new key, so a body cached before `shows`/`newShows` existed is not served for its last hour.
  // M15 T014: the key carries the (UTC) day, so a new day's picks show at midnight, not up to 1 h later;
  // every admin save of picks/issues/collections deletes it (`dropDiscoverCache`, guard G-P1).
  return cached<DiscoverBody>(db, discoverCacheKey(today), TTL.discover, async () => {
    const warnings: string[] = [];
    const day = picksForDay(picks, today);
    const pickItems: DiscoverItem[] = [];
    for (const p of day.picks) {
      try {
        const { feed } = await fetchFeed(db, f, p.feedUrl);
        const episode = p.guid === undefined ? feed.episodes[0] : feed.episodes.find((e) => e.guid === p.guid);
        if (!episode) { warnings.push(`pick ${p.feedUrl} ${p.guid ?? '(show)'}: episode not in the feed`); continue; }
        const card = toCard(p.feedUrl, feed.show, episode);
        const row = await registerCard(db, card);
        pickItems.push({ kind: 'pick', key: keyOf(card), episode: { ...card, id: row.id }, why: p.why, ...(day.date ? { date: day.date } : {}) });
      } catch (e) {
        warnings.push(`pick ${p.feedUrl}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const ranked = rankTalkedAbout(await talkedAbout(db, 7), 10);
    const talked: DiscoverItem[] = [];
    for (const r of ranked) {
      const [e] = await db.query<{ id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string }>(
        'SELECT id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url FROM episodes WHERE id = $1', [r.episodeId]);
      if (!e) continue;
      const card: EpisodeCard & { id: string } = { id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url, ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: e.duration_ms } : {}) };
      const score = 3 * r.listeners + 2 * r.comments + 2 * r.clips + r.reactions;
      talked.push({ kind: 'talkedAbout', key: keyOf(card), episode: card, score, reason: describe(r) });
    }

    let trending: DiscoverItem[] = [];
    let chartShows: ShowCard[] = [];
    let newShows: NewShow[] = [];
    const latestByShow = new Map<number, EpisodeCard & { id: string }>();
    try {
      // M10: one chart call at 25 feeds "Popular shows" and the "new shows" candidates;
      // trending walks the first 10 exactly as it did when the chart was read at 10.
      chartShows = await topShows(f, undefined, CHART_LIMIT);
      const shows = chartShows.slice(0, TRENDING_SHOWS);
      // M8 (2026-09-26): this used to be silent. The live chart returned NOTHING for an
      // unknown length of time and `warnings` was `[]`, so Discover looked healthy and
      // For You lost its only source of shows the listener does not already follow.
      // A channel that gives up says so (principle IV).
      if (shows.length === 0) warnings.push('chart: the top-podcasts chart returned no usable shows');
      const noEpisode: string[] = [];
      for (const s of shows) {
        if (trending.length >= 8) continue;
        if (s.appleId === undefined) { noEpisode.push(`${s.title} (no apple id)`); continue; }
        try {
          const [latest] = await latestEpisodes(f, s.appleId, 1);
          if (!latest) { noEpisode.push(s.title); continue; }
          const row = await registerCard(db, latest);
          latestByShow.set(s.appleId, { ...latest, id: row.id });
          trending.push({ kind: 'trending', key: keyOf(latest), episode: { ...latest, id: row.id }, reason: 'Trending on the chart' });
        } catch (e) { warnings.push(`trending ${s.title}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (noEpisode.length > 0) warnings.push(`chart: no episode for ${noEpisode.length} of ${shows.length} shows (${noEpisode.slice(0, 3).join(', ')})`);
      newShows = await newShowsFrom(db, f, chartShows, latestByShow, warnings);
    } catch (e) { warnings.push(`chart: ${e instanceof Error ? e.message : String(e)}`); }
    const pickKeys = new Set(pickItems.map((p) => p.key));
    trending = trending.filter((t) => !pickKeys.has(t.key));
    const filled = fillWithTrending(talked, trending, 5);
    const talkedFinal = filled.filter((i) => i.kind === 'talkedAbout');
    const trendingFinal = filled.filter((i) => i.kind === 'trending');
    return {
      ...(day.date ? { date: day.date } : {}), picks: pickItems, talkedAbout: talkedFinal, trending: trendingFinal,
      shows: chartShows.slice(0, SHOWS_STORED), newShows, warnings,
    };
  });
}

/**
 * M10 "new shows": chart shows Apple lists at most 12 episodes for (`trackCount`), in
 * chart order, up to 3, each with its latest episode — registered like trending. A show
 * trending already fetched costs nothing; any other costs one lookup, at most 3 in all.
 * A show Apple gives no count for is not "new": unknown is not small.
 */
async function newShowsFrom(db: Db, f: typeof fetch, chart: readonly ShowCard[], latestByShow: ReadonlyMap<number, EpisodeCard & { id: string }>, warnings: string[]): Promise<NewShow[]> {
  const out: NewShow[] = [];
  let calls = 0;
  for (const s of chart) {
    if (out.length >= NEW_SHOWS) break;
    if (s.appleId === undefined || s.episodeCount === undefined || s.episodeCount > NEW_SHOW_MAX_EPISODES) continue;
    let episode = latestByShow.get(s.appleId);
    if (episode === undefined) {
      if (calls >= NEW_SHOW_EXTRA_CALLS) break;
      calls++;
      try {
        const [latest] = await latestEpisodes(f, s.appleId, 1);
        if (latest === undefined) continue;
        const row = await registerCard(db, latest);
        episode = { ...latest, id: row.id };
      } catch (e) { warnings.push(`new show ${s.title}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    }
    out.push({ show: s, episode });
  }
  return out;
}

/** M12 FR-071: the whole "Talked about" chart — the same ranking as Discover's list, up to `limit` (≤ 100), shows the owner hid left out. */
export const CHART_MAX = 100;
export async function talkedAboutChart(db: Db, limit: number): Promise<(DiscoverItem & { rank: number })[]> {
  const hidden = await hiddenFeedUrls(db);
  const ranked = rankTalkedAbout(await talkedAbout(db, 7), Number.MAX_SAFE_INTEGER);
  const rows = await db.query<{ id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string }>(
    'SELECT id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url FROM episodes WHERE id = ANY($1::text[])', [ranked.map((r) => r.episodeId)]);
  const byId = new Map(rows.map((e) => [e.id, e]));
  const out: (DiscoverItem & { rank: number })[] = [];
  for (const r of ranked) {
    if (out.length >= limit) break;
    const e = byId.get(r.episodeId);
    if (!e || hidden.has(e.feed_url)) continue;
    const card: EpisodeCard & { id: string } = { id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url, ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}) };
    const score = 3 * r.listeners + 2 * r.comments + 2 * r.clips + r.reactions;
    out.push({ kind: 'talkedAbout', key: keyOf(card), episode: card, score, reason: describe(r), rank: out.length + 1 });
  }
  return out;
}

function describe(r: { listeners: number; comments: number; clips: number; reactions: number }): string {
  const parts: string[] = [];
  if (r.listeners > 0) parts.push(`${r.listeners} listened`);
  if (r.comments > 0) parts.push(`${r.comments} comment${r.comments === 1 ? '' : 's'}`);
  if (r.clips > 0) parts.push(`${r.clips} clip${r.clips === 1 ? '' : 's'}`);
  if (r.reactions > 0) parts.push(`${r.reactions} reaction${r.reactions === 1 ? '' : 's'}`);
  return `${parts.join(' · ')} this week`;
}
