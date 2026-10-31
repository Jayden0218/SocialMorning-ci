// Route for the Moments list: the hottest moments of episodes the viewer follows, then the chart's.
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { viaStore } from '../../db/backend.ts';
import { cached } from '../../db/repos/cache.ts';
import { chart } from '../../db/repos/discover/explore.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { hiddenEpisodeIds } from '../../db/repos/studio/hidden-episodes.ts';
import type { EpisodeInfo, EpisodeMoments } from '../../db/repos/discover/ddb/moments.ts';

const episodeMoments = viaStore<typeof import('../../db/repos/discover/ddb/moments.ts').episodeMoments>('dv/moments', 'episodeMoments');
const followedEpisodes = viaStore<typeof import('../../db/repos/discover/ddb/moments.ts').followedEpisodes>('dv/moments', 'followedEpisodes');
const showMomentEpisodes = viaStore<typeof import('../../db/repos/discover/ddb/moments.ts').showMomentEpisodes>('dv/moments', 'showMomentEpisodes');

export const MOMENTS_TTL = 5 * 60_000;
export const CHART_EPISODES = 50;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export type MomentItem = {
  episodeId: string; showTitle: string; episodeTitle: string; feedUrl: string; guid: string; enclosureUrl?: string; coverUrl?: string; startMs: number; endMs: number;
  reactions: number; rank: number; followed: boolean; curve: number[]; comments: { id: string; author: string; text: string; likes: number }[];
};

/** Mounted at /v1/discover — GET /moments?limit=1..50&cursor= (optional auth: a signed-in viewer's followed shows come first). */
export const moments = new Hono<AuthEnv>();

const cursorOf = (raw: string | undefined): number => {
  if (raw === undefined) return 0;
  const m = /^m1:(\d{1,6})$/.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!m) throw new ApiError('validation', 'cursor is not valid.', { fields: ['cursor'] });
  return Number(m[1]);
};

moments.get('/moments', optionalAuth, async (c) => {
  const rawLimit = c.req.query('limit');
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
  if (!/^\d+$/.test(rawLimit ?? '1') || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new ApiError('validation', `limit must be 1–${MAX_LIMIT}.`, { fields: ['limit'] });
  const from = cursorOf(c.req.query('cursor'));
  const db = c.get('db');
  const me = c.get('listener')?.id;

  // `?feedUrl=` narrows the list to that show's newest episodes (the Show screen's Hot moments tab): same rule, same cache, no chart.
  const feedFilter = c.req.query('feedUrl');
  if (feedFilter !== undefined && (feedFilter === '' || feedFilter.length > 2048 || !/^https?:\/\//i.test(feedFilter))) throw new ApiError('validation', 'feedUrl is not valid.', { fields: ['feedUrl'] });

  const [hiddenFeeds, hiddenEps] = await Promise.all([hiddenFeedUrls(db), hiddenEpisodeIds(db)]);
  // Each episode's moments are one 5-minute cached copy; the bounded candidate set keeps every read a Query/GetItem.
  const read = async (e: EpisodeInfo): Promise<EpisodeMoments> => (await cached<EpisodeMoments>(db, `moments:v3:ep:${e.id}`, MOMENTS_TTL, () => episodeMoments(db, e))).body;
  if (feedFilter !== undefined) {
    const shown = hiddenFeeds.has(feedFilter) ? { episodes: [] as EpisodeInfo[], followed: false } : await showMomentEpisodes(db, feedFilter, me, hiddenEps);
    const rows = (await Promise.all(shown.episodes.map((e) => read(e)))).flatMap((e) => e.moments.map((m) => ({
      episodeId: e.episodeId, showTitle: e.showTitle, episodeTitle: e.episodeTitle, feedUrl: e.feedUrl, guid: e.guid, ...(e.enclosureUrl ? { enclosureUrl: e.enclosureUrl } : {}), ...(e.coverUrl ? { coverUrl: e.coverUrl } : {}),
      startMs: m.startMs, endMs: m.endMs, reactions: m.reactions, followed: shown.followed, curve: e.curve, comments: m.comments,
    }))).sort((a, b) => b.reactions - a.reactions || a.startMs - b.startMs || (a.episodeId < b.episodeId ? -1 : 1)).map((m, n): MomentItem => ({ ...m, rank: n + 1 }));
    const next = from + limit < rows.length ? Buffer.from(`m1:${from + limit}`).toString('base64url') : undefined;
    c.header('cache-control', 'private, max-age=60');
    return c.json({ items: rows.slice(from, from + limit), ...(next ? { next } : {}), computedAt: new Date().toISOString() });
  }
  const followedInfo: EpisodeInfo[] = me ? await followedEpisodes(db, me, hiddenEps, hiddenFeeds) : [];
  const followedIds = new Set(followedInfo.map((e) => e.id));
  const { items: chartItems } = await chart(db, 'talked', CHART_EPISODES);
  const chartInfo: EpisodeInfo[] = chartItems.filter((i) => !followedIds.has(i.episode.id)).map((i) => ({
    id: i.episode.id, title: i.episode.title, showTitle: i.episode.showTitle, feedUrl: i.episode.feedUrl, guid: i.episode.guid,
    ...(i.episode.enclosureUrl ? { enclosureUrl: i.episode.enclosureUrl } : {}),
    ...(i.episode.imageUrl ? { imageUrl: i.episode.imageUrl } : {}), ...(i.episode.durationMs !== undefined ? { durationMs: i.episode.durationMs } : {}),
  }));

  const group = async (eps: EpisodeInfo[], followed: boolean): Promise<Omit<MomentItem, 'rank'>[]> => {
    const rows = (await Promise.all(eps.map(read))).flatMap((e) => e.moments.map((m) => ({
      episodeId: e.episodeId, showTitle: e.showTitle, episodeTitle: e.episodeTitle, feedUrl: e.feedUrl, guid: e.guid, ...(e.enclosureUrl ? { enclosureUrl: e.enclosureUrl } : {}), ...(e.coverUrl ? { coverUrl: e.coverUrl } : {}),
      startMs: m.startMs, endMs: m.endMs, reactions: m.reactions, followed, curve: e.curve, comments: m.comments,
    })));
    return rows.sort((a, b) => b.reactions - a.reactions || a.startMs - b.startMs || (a.episodeId < b.episodeId ? -1 : 1));
  };
  const all = [...(await group(followedInfo, true)), ...(await group(chartInfo, false))].map((m, n): MomentItem => ({ ...m, rank: n + 1 }));

  const page = all.slice(from, from + limit);
  const next = from + limit < all.length ? Buffer.from(`m1:${from + limit}`).toString('base64url') : undefined;
  c.header('cache-control', 'private, max-age=60');
  return c.json({ items: page, ...(next ? { next } : {}), computedAt: new Date().toISOString() });
});
