// Discover route: the public Discover page, the three charts, the treasure hunt, the plaza and daily picks.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { picksForDay } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { CHART_MAX, discoverBody } from '../../db/repos/discover/discover.ts';
import { CHART_KINDS, CHART_LIST, chart, hunt, likedByFollowed, plaza, type ChartKind, type Face } from '../../db/repos/discover/explore.ts';
import { collectionsWithoutHidden, followedHere, resolveCollections, statsFor, withStats, type Collection, type FollowedHere, type NewArrival, type Said } from '../../db/repos/discover/discover-extras.ts';
import { discoverLists, discoverOverrides, servedArrivals, servedSaid, servedVideo } from '../../db/repos/discover/served.ts';
import { active, NONE } from '../../db/repos/discover/lists.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { hiddenEpisodeIds } from '../../db/repos/studio/hidden-episodes.ts';
import { ApiError } from '../../errors.ts';
import type { DiscoverItem } from '../../db/repos/discover/discover.ts';
import { getLayout } from '../../db/repos/discover/discover-settings.ts';
import { episodeFor } from './issues.ts';

/** Mounted at /v1/discover — public; ETag/304; `stale` when the catalogue could not be refreshed. */
export const discover = new Hono<AuthEnv>();

/** M10: an addition that fails is left out with a warning; the M5 fields never depend on it (principle IV). */
async function optional<T>(name: string, warnings: string[], f: () => Promise<T>): Promise<T | undefined> {
  try { return await f(); } catch (e) { warnings.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); return undefined; }
}

discover.get('/', optionalAuth, async (c) => {
  const cat = c.get('catalog');
  const db = c.get('db');
  const { body, stale } = await discoverBody(db, cat.fetch, cat.picks, cat.today());
  const { warnings, ...pub } = body;
  const extraWarnings: string[] = [];
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db); // M24 US11: hidden episodes leave this list.
  const resolved = await optional('collections', extraWarnings, () => resolveCollections(db, cat.fetch, cat.collections));
  if (resolved) extraWarnings.push(...resolved.warnings);
  let collections: Collection[] | undefined = resolved ? collectionsWithoutHidden(resolved.collections, hidden, hiddenEps) : undefined;
  // M25 A1/A4: the owner's pins and hides on every Discover list, read once; unreadable → today's lists.
  const ov = await discoverOverrides(db, (m) => extraWarnings.push(m));
  const of = (id: string) => ov.get(id) ?? NONE;
  const followed: FollowedHere | undefined = await optional('followedHere', extraWarnings, () => followedHere(db));
  const saidList: Said[] | undefined = await optional('said', extraWarnings, () => servedSaid(db, of('said')));
  const video = await optional('video', extraWarnings, () => servedVideo(db, of('video')));
  const arrivals: NewArrival[] | undefined = await optional('newArrivals', extraWarnings, () => servedArrivals(db, of('arrivals')));
  const ids = [...pub.picks, ...(collections ?? []).flatMap((x) => x.items)].map((i) => i.episode.id);
  const stats = await optional('stats', extraWarnings, () => statsFor(db, ids));
  const withCounts = stats ? withStats(pub.picks, stats) : pub.picks;
  // M21 US7 (T080): faces of people the viewer follows who liked each pick (≤ 3), signed in only.
  const viewer = c.get('listener')?.id;
  const faces: Map<string, Face[]> | undefined = viewer
    ? await optional('likedBy', extraWarnings, () => likedByFollowed(db, viewer, pub.picks.map((p) => p.episode.id)))
    : undefined;
  const picks: (DiscoverItem & { likedBy?: Face[] })[] = faces
    ? withCounts.map((p) => { const f = faces.get(p.episode.id); return f ? { ...p, likedBy: f } : p; })
    : withCounts;
  if (stats && collections) collections = collections.map((x) => ({ ...x, items: withStats(x.items, stats) }));
  // M25 A4: Top, Talked about, New shows, Popular shows and Premium picks with the owner's rows
  // (Premium picks: the chart's next six — no price, nothing sold, constitution 2.1.0).
  const lists = await optional('lists', extraWarnings, () => discoverLists(db, pub, ov));
  const trending: DiscoverItem[] = lists?.trending ?? pub.trending;
  const talkedAbout: DiscoverItem[] = lists?.talkedAbout ?? pub.talkedAbout;
  const newShows = lists ? lists.newShows : pub.newShows;
  const shows = lists ? lists.shows : pub.shows?.slice(0, 6);
  const premium = lists ? lists.premium : pub.shows?.slice(6, 12);
  // M15 T034 (FR-026–FR-029): the owner's section layout, at serve time. Unreadable → today's Discover, no `layout`.
  const saved = await optional('discoverSettings', extraWarnings, () => getLayout(db));
  const layout = saved ? { order: saved.order, hidden: saved.hidden } : undefined;

  const etag = `W/"${createHash('sha256').update(JSON.stringify([
    body.date, body.picks.map((p) => p.key), talkedAbout.map((p) => p.key), trending.map((p) => p.key),
    // M15: the layout and the pins/hides (already in `trending`) are in the hash too.
    layout ?? null,
    // M10: every new list is in the hash, so a change in any of them is a 200, not a 304.
    shows?.map((s) => s.feedUrl), newShows?.map((n) => n.episode.id),
    followed ? [followed.total, followed.shows.map((s) => [s.feedUrl, s.followers, s.title])] : null,
    saidList?.map((s) => s.commentId), collections?.map((x) => [x.id, x.title, x.subtitle, x.items.map((i) => i.key)]),
    picks.map((p) => p.stats ?? null), picks.map((p) => p.likedBy?.map((f) => f.id) ?? null), collections?.map((x) => x.items.map((i) => i.stats ?? null)),
    video?.map((v) => v.episode.id),
    premium?.map((s) => s.feedUrl), arrivals?.map((a) => a.episode.id),
  ])).digest('base64url').slice(0, 16)}"`;
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  c.header('ETag', etag);
  const all = [...warnings, ...extraWarnings];
  if (all.length > 0) console.warn(`[discover] ${all.join(' | ')}`);
  return c.json({
    ...pub, picks, trending, talkedAbout,
    ...(newShows ? { newShows } : {}),
    ...(layout ? { layout } : {}),
    ...(shows ? { shows } : {}),
    ...(followed ? { followedHere: followed } : {}),
    ...(saidList ? { said: saidList } : {}),
    ...(collections ? { collections } : {}),
    ...(video && video.length > 0 ? { video } : {}),
    ...(premium ? { premium } : {}),
    ...(arrivals ? { newArrivals: arrivals } : {}),
    stale, serverTime: new Date().toISOString(),
  });
});

/**
 * M12 FR-071, M21 T080 — GET /v1/discover/chart?kind=talked|new|rising&limit=1..100 (default
 * talked, 100) → { kind, items, updatedAt }. The rules of each chart are in
 * db/repos/discover/explore.ts and on the phone's chart-rules page; each is cached 5 min.
 * Counts only, never names (G6).
 */
discover.get('/chart', async (c) => {
  const raw = c.req.query('limit');
  const limit = raw === undefined ? CHART_MAX : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > CHART_MAX) throw new ApiError('validation', `limit must be 1–${CHART_MAX}.`, { fields: ['limit'] });
  const kind = (c.req.query('kind') ?? 'talked') as ChartKind;
  if (!CHART_KINDS.includes(kind)) throw new ApiError('validation', `kind must be ${CHART_KINDS.join(', ')}.`, { fields: ['kind'] });
  const db = c.get('db');
  // M25 A4: the owner's pins and hides on this chart. Unreadable → the chart as computed.
  const ov = await active(db, CHART_LIST[kind]).catch(() => NONE);
  const { items, updatedAt } = await chart(db, kind, limit, Date.now, ov);
  c.header('cache-control', 'public, max-age=300');
  return c.json({ kind, items, updatedAt, serverTime: new Date().toISOString() });
});

/** `?shuffle=n`: 0 (default) … 999. */
function shuffleOf(raw: string | undefined): number {
  const n = raw === undefined ? 0 : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new ApiError('validation', 'shuffle must be 0–999.', { fields: ['shuffle'] });
  return n;
}

/**
 * M21 T080 — GET /v1/discover/hunt?shuffle=n → { day, shuffle, items: Episode[≤3] }. The treasure
 * hunt is OUR OWN DESIGN (owner, 2026-10-06): the same 3 all day for one listener, a new set the
 * next day; never a subscribed or turned-down show. `day` is the catalogue's today (the picks'
 * day). Per viewer, so never cached publicly.
 */
discover.get('/hunt', optionalAuth, async (c) => {
  const shuffle = shuffleOf(c.req.query('shuffle'));
  const day = c.get('catalog').today();
  const ov = await active(c.get('db'), 'hunt').catch(() => NONE); // M25 A4
  const items = await hunt(c.get('db'), c.get('listener')?.id, day, shuffle, ov);
  c.header('cache-control', 'private, no-store');
  return c.json({ day, shuffle, items });
});

/**
 * M21 T080 — GET /v1/discover/plaza?cursor=&shuffle=n → { shuffle, items: Show[], next? }. The
 * new-shows plaza is OUR OWN DESIGN (owner, 2026-10-06): the newest shows in a seeded order per
 * listener and day; Shuffle asks for the next seed.
 */
discover.get('/plaza', optionalAuth, async (c) => {
  const shuffle = shuffleOf(c.req.query('shuffle'));
  const rawCursor = c.req.query('cursor');
  const cursor = rawCursor === undefined ? 0 : Number(rawCursor);
  if (!Number.isInteger(cursor) || cursor < 0) throw new ApiError('validation', 'cursor must be a page offset.', { fields: ['cursor'] });
  const seed = `${c.get('listener')?.id ?? 'anon'}|${c.get('catalog').today()}|${shuffle}`;
  const ov = await active(c.get('db'), 'plaza').catch(() => NONE); // M25 A4
  const page = await plaza(c.get('db'), seed, cursor, ov);
  c.header('cache-control', 'private, no-store');
  return c.json({ shuffle, ...page });
});

/** M21 T080 — GET /v1/discover/daily → { date?, items: {feedUrl, guid?, why, episode|null}[] }: today's picks with the editor's notes. */
discover.get('/daily', async (c) => {
  const cat = c.get('catalog');
  const db = c.get('db');
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db); // M24 US11: hidden episodes leave this list.
  const day = picksForDay(cat.picks, cat.today());
  const items = [];
  for (const p of day.picks) {
    if (hidden.has(p.feedUrl)) continue;
    const episode = await episodeFor(db, p.feedUrl, p.guid, true);
    if (episode && hiddenEps.has(episode.id)) continue;
    items.push({ feedUrl: p.feedUrl, ...(p.guid !== undefined ? { guid: p.guid } : {}), why: p.why, episode });
  }
  c.header('cache-control', 'public, max-age=300');
  return c.json({ ...(day.date ? { date: day.date } : {}), items });
});
