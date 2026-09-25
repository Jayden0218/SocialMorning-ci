/**
 * The Discover payload (M5 US1, research R3/R4): today's picks resolved through their
 * feeds, "listened and talked about" from the app's own aggregates, the all-genres
 * chart's latest episodes as the filler. Computed on demand, cached 1 h. Every card is
 * registered as an M3 episode. Nothing here names a listener (guard G6).
 */
import { fillWithTrending, picksForDay, rankTalkedAbout, type PickIn } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { hiddenFeedUrls } from './moderation.ts';
import { cached, TTL } from './cache.ts';
import { talkedAbout } from './activity-stats.ts';
import { fetchFeed, registerCard, toCard } from '../../catalog/feed.ts';
import { latestEpisodes, topShows, type EpisodeCard } from '../../catalog/apple.ts';

export type DiscoverItem = { kind: 'pick' | 'talkedAbout' | 'trending'; key: string; episode: EpisodeCard & { id: string }; why?: string; reason?: string; score?: number; date?: string };
export type DiscoverBody = { date?: string; picks: DiscoverItem[]; talkedAbout: DiscoverItem[]; trending: DiscoverItem[]; warnings: string[] };

const keyOf = (c: EpisodeCard) => `${c.feedUrl}\u0001${c.guid}`;

/**
 * M6 (FR-014, G7): a show the owner hid leaves every discovery list at once — applied to
 * the cached body at serve time, so it does not wait for the hour's cache to expire.
 */
export function excludeHidden(body: DiscoverBody, hidden: ReadonlySet<string>): DiscoverBody {
  if (hidden.size === 0) return body;
  const keep = (i: DiscoverItem) => !hidden.has(i.episode.feedUrl);
  return { ...body, picks: body.picks.filter(keep), talkedAbout: body.talkedAbout.filter(keep), trending: body.trending.filter(keep) };
}

export async function discoverBody(db: Db, f: typeof fetch, picks: readonly PickIn[], today: string): Promise<{ body: DiscoverBody; stale: boolean }> {
  const r = await cachedDiscover(db, f, picks, today);
  return { body: excludeHidden(r.body, await hiddenFeedUrls(db)), stale: r.stale };
}

async function cachedDiscover(db: Db, f: typeof fetch, picks: readonly PickIn[], today: string): Promise<{ body: DiscoverBody; stale: boolean }> {
  return cached<DiscoverBody>(db, 'discover', TTL.discover, async () => {
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
    try {
      const shows = await topShows(f, undefined, 10);
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
          trending.push({ kind: 'trending', key: keyOf(latest), episode: { ...latest, id: row.id }, reason: 'Trending on the chart' });
        } catch (e) { warnings.push(`trending ${s.title}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (noEpisode.length > 0) warnings.push(`chart: no episode for ${noEpisode.length} of ${shows.length} shows (${noEpisode.slice(0, 3).join(', ')})`);
    } catch (e) { warnings.push(`chart: ${e instanceof Error ? e.message : String(e)}`); }
    const pickKeys = new Set(pickItems.map((p) => p.key));
    trending = trending.filter((t) => !pickKeys.has(t.key));
    const filled = fillWithTrending(talked, trending, 5);
    const talkedFinal = filled.filter((i) => i.kind === 'talkedAbout');
    const trendingFinal = filled.filter((i) => i.kind === 'trending');
    return { ...(day.date ? { date: day.date } : {}), picks: pickItems, talkedAbout: talkedFinal, trending: trendingFinal, warnings };
  });
}

function describe(r: { listeners: number; comments: number; clips: number; reactions: number }): string {
  const parts: string[] = [];
  if (r.listeners > 0) parts.push(`${r.listeners} listened`);
  if (r.comments > 0) parts.push(`${r.comments} comment${r.comments === 1 ? '' : 's'}`);
  if (r.clips > 0) parts.push(`${r.clips} clip${r.clips === 1 ? '' : 's'}`);
  if (r.reactions > 0) parts.push(`${r.reactions} reaction${r.reactions === 1 ? '' : 's'}`);
  return `${parts.join(' · ')} this week`;
}
