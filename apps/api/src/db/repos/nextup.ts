/**
 * "Next up" (M5 FR-008/009, research R5): four sources for episode E, merged by the shared
 * `nextUp` rule (strongest reason wins, one entry per episode, the viewer's exclusions
 * applied after the cache). Aggregates only — nothing here names a listener.
 */
import { nextUp, scoreTalkedAbout, REASON_LABEL, type Reason } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { hiddenFeedUrls } from './moderation.ts';
import { cached, TTL } from './cache.ts';
import { talkedAbout } from './activity-stats.ts';
import { fetchFeed, registerCard, toCard } from '../../catalog/feed.ts';
import { genreIdFor } from '../../catalog/genres.ts';
import { latestEpisodes, topShows, type EpisodeCard } from '../../catalog/apple.ts';

export type NextUpCandidate = { key: string; reason: Reason; episode: EpisodeCard & { id: string } };
export type NextUpSources = Record<Reason, NextUpCandidate[]>;
export type NextUpItem = { episode: EpisodeCard & { id: string }; reason: Reason; label: string };

type EpRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string };
const cardOf = (e: EpRow): EpisodeCard & { id: string } => ({ id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url, ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: e.duration_ms } : {}) });

/** The cached part: everything that does not depend on the viewer. */
export async function nextUpSources(db: Db, f: typeof fetch, episodeId: string): Promise<{ sources: NextUpSources; genre?: string } | undefined> {
  const [e] = await db.query<EpRow>('SELECT id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url FROM episodes WHERE id = $1', [episodeId]);
  if (!e) return undefined;
  const r = await cached<{ sources: NextUpSources; genre?: string }>(db, `nextup:${episodeId}`, TTL.nextup, async () => {
    const sources: NextUpSources = { alsoListened: [], talkedAboutOnShow: [], newOnShow: [], trendingInCategory: [] };
    const key = (c: EpisodeCard) => `${c.feedUrl}\u0001${c.guid}`;

    // 1. People who listened to this also listened — counts over non-hidden listened rows, never who.
    const also = await db.query<EpRow & { n: number }>(
      `SELECT e.*, count(*)::int AS n FROM activity a JOIN activity b ON b.actor_id = a.actor_id AND b.kind = 'listened' AND b.hidden = false AND b.episode_id <> a.episode_id
       JOIN episodes e ON e.id = b.episode_id
       WHERE a.kind = 'listened' AND a.hidden = false AND a.episode_id = $1
       GROUP BY e.id ORDER BY n DESC, max(b.created_at) DESC LIMIT 3`, [episodeId]);
    sources.alsoListened = also.map((row) => ({ key: key(cardOf(row)), reason: 'alsoListened', episode: cardOf(row) }));

    // 2. Most talked about on this show (30 days), other episodes.
    const rows = (await talkedAbout(db, 30, e.feed_url)).filter((x) => x.episodeId !== episodeId).sort((a, b) => scoreTalkedAbout(b) - scoreTalkedAbout(a) || b.newestAt - a.newestAt).slice(0, 3);
    for (const x of rows) {
      const [row] = await db.query<EpRow>('SELECT id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url FROM episodes WHERE id = $1', [x.episodeId]);
      if (row) sources.talkedAboutOnShow.push({ key: key(cardOf(row)), reason: 'talkedAboutOnShow', episode: cardOf(row) });
    }

    // 3. New on this show — the feed's newest, registered.
    let genre: { id: number; name: string } | undefined;
    try {
      const { feed } = await fetchFeed(db, f, e.feed_url);
      genre = genreIdFor(feed.show.categories);
      for (const ep of feed.episodes.slice(0, 5)) {
        if (ep.guid === e.guid) continue;
        const card = toCard(e.feed_url, feed.show, ep);
        const row = await registerCard(db, card);
        sources.newOnShow.push({ key: key(card), reason: 'newOnShow', episode: { ...card, id: row.id } });
        if (sources.newOnShow.length >= 2) break;
      }
    } catch { /* the feed is down: this source is simply empty (principle IV) */ }

    // 4. Trending in the category — the chart's top shows' latest episodes.
    try {
      let shows = await topShows(f, genre?.id, 6);
      if (shows.length === 0 && genre !== undefined) shows = await topShows(f, undefined, 6); // an unknown/empty genre chart → the all-genres chart
      for (const s of shows) {
        if (sources.trendingInCategory.length >= 2 || s.appleId === undefined) continue;
        try {
          const [latest] = await latestEpisodes(f, s.appleId, 1);
          if (!latest || key(latest) === `${e.feed_url}\u0001${e.guid}`) continue;
          const row = await registerCard(db, latest);
          sources.trendingInCategory.push({ key: key(latest), reason: 'trendingInCategory', episode: { ...latest, id: row.id } });
        } catch { /* one show's lookup failed: skip it */ }
      }
    } catch { /* the chart is down: empty */ }
    return { sources, ...(genre ? { genre: genre.name } : {}) };
  });
  const hidden = await hiddenFeedUrls(db);
  if (hidden.size === 0) return r.body;
  const keep = <T extends { episode: { feedUrl: string } }>(xs: T[]) => xs.filter((x) => !hidden.has(x.episode.feedUrl));
  const s = r.body.sources;
  return { ...r.body, sources: { alsoListened: keep(s.alsoListened), talkedAboutOnShow: keep(s.talkedAboutOnShow), newOnShow: keep(s.newOnShow), trendingInCategory: keep(s.trendingInCategory) } };
}

export async function nextUpFor(db: Db, f: typeof fetch, episodeId: string, viewerId: string | undefined): Promise<NextUpItem[] | undefined> {
  const [current] = await db.query<{ feed_url: string; guid: string }>('SELECT feed_url, guid FROM episodes WHERE id = $1', [episodeId]);
  if (!current) return undefined;
  const cachedSources = await nextUpSources(db, f, episodeId);
  if (!cachedSources) return undefined;
  const exclude = new Set<string>([`${current.feed_url}\u0001${current.guid}`]);
  if (viewerId) {
    const finished = await db.query<{ feed_url: string; guid: string }>(
      'SELECT e.feed_url, e.guid FROM positions p JOIN episodes e ON e.id = p.episode_id WHERE p.listener_id = $1 AND p.finished = true', [viewerId]);
    for (const x of finished) exclude.add(`${x.feed_url}\u0001${x.guid}`);
  }
  const items = nextUp(cachedSources.sources, exclude, 8);
  return items.map((c) => ({ episode: c.episode, reason: c.reason, label: c.reason === 'trendingInCategory' && cachedSources.genre ? `Trending in ${cachedSources.genre}` : REASON_LABEL[c.reason] }));
}
