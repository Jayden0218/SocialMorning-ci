// The lists the phone is served, with the owner's pins and hides applied — shared by the public routes and Admin › Lists.
/**
 * M25 A1/A2/A4 (lane AL). The public routes and Admin › Lists' "live now" view call the same
 * functions, so what the owner sees in Admin is what a listener is served.
 */
import type { Db } from '../../db.ts';
import { cached } from '../cache.ts';
import { hiddenFeedUrls } from '../safety/moderation.ts';
import { hiddenEpisodeIds } from '../studio/hidden-episodes.ts';
import { chartIds, showsByIds, topShows, type EpisodeCard, type ShowCard } from '../../../catalog/apple.ts';
import { SHOWS_SERVED, type DiscoverBody, type DiscoverItem, type NewShow } from './discover.ts';
import { ARRIVALS_SHOWN, newArrivals, said, SAID_SHOWN, saidByIds, videoEpisodes, type NewArrival, type Said } from './discover-extras.ts';
import { activeFor, applyList, categoryListId, defaultTab, NONE, pinnedEpisode, pinnedShow, type Active, type DefaultTab } from './lists.ts';

const keyOf = (c: { feedUrl: string; guid: string }) => `${c.feedUrl}\u0001${c.guid}`;
const epRef = (e: { feedUrl: string; guid: string }) => ({ feedUrl: e.feedUrl, guid: e.guid });
const VIDEO_SHOWN = 10;

export type DiscoverLists = {
  trending: DiscoverItem[]; talkedAbout: DiscoverItem[]; newShows?: NewShow[]; shows?: ShowCard[]; premium?: ShowCard[];
};

export const DISCOVER_LIST_IDS = ['trending', 'talked', 'new', 'popular', 'premium', 'video', 'arrivals', 'said'] as const;

/** All the Discover lists' rows that count now, in one read; unreadable → none (today's lists). */
export async function discoverOverrides(db: Db, warn: (m: string) => void): Promise<Map<string, Active>> {
  try { return await activeFor(db, DISCOVER_LIST_IDS); } catch (e) { warn(`listOverrides: ${e instanceof Error ? e.message : String(e)}`); return new Map(); }
}

/**
 * The cached Discover body's lists with the owner's rows applied. `pub` already has hidden shows
 * and episodes taken out (`discoverBody`); a pinned item is checked against them again here.
 */
export async function discoverLists(db: Db, pub: Omit<DiscoverBody, 'warnings'>, ov: Map<string, Active>): Promise<DiscoverLists> {
  const of = (id: string) => ov.get(id) ?? NONE;
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db);
  const epPin = (kind: DiscoverItem['kind']) => async (p: { feedUrl?: string; guid?: string }) => {
    const e = await pinnedEpisode(db, p, hidden, hiddenEps);
    return e ? { kind, key: keyOf(e), episode: e, reason: 'Picked by the editors' } as DiscoverItem : undefined;
  };
  const trending = await applyList(pub.trending, of('trending'), (i) => epRef(i.episode), epPin('trending'));
  const talkedAbout = await applyList(pub.talkedAbout, of('talked'), (i) => epRef(i.episode), epPin('talkedAbout'));
  const newShows = pub.newShows
    ? await applyList(pub.newShows, of('new'), (n) => ({ feedUrl: n.show.feedUrl }), async (p) => {
      const show = await pinnedShow(db, p.feedUrl, hidden);
      const episode = show ? await pinnedEpisode(db, { feedUrl: show.feedUrl }, hidden, hiddenEps) : undefined;
      return show && episode ? { show, episode } : undefined;
    })
    : undefined;
  let shows: ShowCard[] | undefined;
  let premium: ShowCard[] | undefined;
  if (pub.shows) {
    const showPin = async (p: { feedUrl?: string }) => pinnedShow(db, p.feedUrl, hidden);
    // Premium's own hides leave the pool first, so Popular cannot be refilled with one of them below it.
    const popular = (await applyList(pub.shows, of('popular'), (s) => ({ feedUrl: s.feedUrl }), showPin)).slice(0, SHOWS_SERVED);
    const taken = new Set(popular.map((s) => s.feedUrl));
    const rest = pub.shows.filter((s) => !taken.has(s.feedUrl));
    // Owner, 2026-10-05: "Premium picks" — the chart's next six. No price, nothing sold (constitution 2.1.0).
    premium = (await applyList(rest, of('premium'), (s) => ({ feedUrl: s.feedUrl }), showPin)).filter((s) => !taken.has(s.feedUrl)).slice(0, SHOWS_SERVED);
    shows = popular;
  }
  return { trending, talkedAbout, ...(newShows ? { newShows } : {}), ...(shows ? { shows } : {}), ...(premium ? { premium } : {}) };
}

/** "Podcasts you can watch" with the owner's rows. */
export async function servedVideo(db: Db, ov: Active): Promise<DiscoverItem[]> {
  const base = await videoEpisodes(db, VIDEO_SHOWN * 2);
  if (ov.pins.length === 0 && ov.hides.length === 0) return base.slice(0, VIDEO_SHOWN);
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db);
  const out = await applyList<DiscoverItem>(base, ov, (i) => epRef(i.episode), async (p) => {
    const e = await pinnedEpisode(db, p, hidden, hiddenEps);
    return e ? { kind: 'trending', key: keyOf(e), episode: { ...e, mediaKind: 'video' } as EpisodeCard & { id: string } } : undefined;
  });
  return out.slice(0, VIDEO_SHOWN);
}

/** "New arrivals" (Studio-made shows) with the owner's rows. */
export async function servedArrivals(db: Db, ov: Active): Promise<NewArrival[]> {
  const base = await newArrivals(db, ARRIVALS_SHOWN * 2);
  if (ov.pins.length === 0 && ov.hides.length === 0) return base.slice(0, ARRIVALS_SHOWN);
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db);
  const out = await applyList(base, ov, (n) => ({ feedUrl: n.show.feedUrl }), async (p) => {
    const show = await pinnedShow(db, p.feedUrl, hidden);
    const episode = show ? await pinnedEpisode(db, { feedUrl: show.feedUrl }, hidden, hiddenEps) : undefined;
    return show && episode ? { show: { feedUrl: show.feedUrl, title: show.title, author: show.author, ...(show.imageUrl ? { imageUrl: show.imageUrl } : {}), genres: show.genres, episodeCount: 0 }, episode } : undefined;
  });
  return out.slice(0, ARRIVALS_SHOWN);
}

/** "What listeners said" with the owner's pinned and hidden quotes. */
export async function servedSaid(db: Db, ov: Active): Promise<Said[]> {
  const base = await said(db, SAID_SHOWN * 2);
  if (ov.pins.length === 0 && ov.hides.length === 0) return base.slice(0, SAID_SHOWN);
  const pinned = new Map((await saidByIds(db, ov.pins.flatMap((p) => (p.commentId ? [p.commentId] : [])))).map((s) => [s.commentId, s]));
  const out = await applyList(base, ov, (s) => ({ commentId: s.commentId }), async (p) => (p.commentId ? pinned.get(p.commentId) : undefined));
  return out.slice(0, SAID_SHOWN);
}

// ---- The category page (A2) ----

/** Mirrors routes/discover/categories.ts — 20 a page, 10 pages, cached 6 h. */
export const CATEGORY_TTL = 6 * 60 * 60_000;
export const CATEGORY_SHOWS = 20;
/** Apple's chart stops at 200 shows (curl, 2026-10-05), so 10 pages of 20. */
export const CATEGORY_PAGES = 10;

export type CategoryShow = ShowCard & { pinned?: true };
export type CategoryPage = { shows: CategoryShow[]; stale: boolean; hasMore: boolean; pinned?: string[]; defaultSort?: DefaultTab };

/**
 * One page of a category with the owner's rows: hides leave EVERY page; pins sit at their slots
 * on page 0 (each marked `pinned: true`, and their feed URLs listed in `pinned` — sent only when
 * there are pins — so the phone keeps
 * them in place under For you and Newest too) and are left off every later page.
 */
export async function servedCategory(db: Db, f: typeof fetch, genreId: number, page: number): Promise<CategoryPage> {
  const listId = categoryListId(genreId);
  let ov: Active = NONE;
  let tab: DefaultTab | undefined;
  try { [ov, tab] = await Promise.all([activeFor(db, [listId]).then((m) => m.get(listId) ?? NONE), defaultTab(db, listId)]); }
  catch (e) { console.warn(`[categories] list overrides skipped: ${e instanceof Error ? e.message : String(e)}`); }
  const hidden = await hiddenFeedUrls(db);
  const pinnedUrls = ov.pins.flatMap((p) => (p.feedUrl && !hidden.has(p.feedUrl) ? [p.feedUrl] : []));
  // Only when there is something to say, so an untouched category answers exactly as before.
  const extra = { ...(pinnedUrls.length > 0 ? { pinned: pinnedUrls } : {}), ...(tab ? { defaultSort: tab } : {}) };
  if (page >= CATEGORY_PAGES) return { shows: [], stale: false, hasMore: false, ...extra };
  if (page > 0) {
    const ids = await cached<string[]>(db, `apple:category-ids:${genreId}`, CATEGORY_TTL, () => chartIds(f, genreId, CATEGORY_SHOWS * CATEGORY_PAGES));
    const mine = ids.body.slice(page * CATEGORY_SHOWS, (page + 1) * CATEGORY_SHOWS);
    const got = mine.length === 0
      ? { body: [] as ShowCard[], stale: false }
      : await cached<ShowCard[]>(db, `apple:category:${genreId}:${page}`, CATEGORY_TTL, () => showsByIds(f, mine, { latest: true }));
    const pins = new Set(pinnedUrls);
    const shows = (await applyList(got.body.filter((s) => !hidden.has(s.feedUrl)), { pins: [], hides: ov.hides }, (s) => ({ feedUrl: s.feedUrl })))
      .filter((s) => !pins.has(s.feedUrl));
    const hasMore = (page + 1) * CATEGORY_SHOWS < ids.body.length && page + 1 < CATEGORY_PAGES;
    return { shows, stale: ids.stale || got.stale, hasMore, ...extra };
  }
  const r = await cached<ShowCard[]>(db, `apple:category:${genreId}`, CATEGORY_TTL, () => topShows(f, genreId, CATEGORY_SHOWS, { latest: true }));
  const chart = r.body.filter((s) => !hidden.has(s.feedUrl));
  // M15 T034 (FR-028) → M25 A2: the owner's pins at their slots (any number, a show off the chart too).
  const shows = await applyList<CategoryShow>(chart, ov, (s) => ({ feedUrl: s.feedUrl }), (p) => pinnedShow(db, p.feedUrl, hidden), (s) => ({ ...s, pinned: true }));
  // A full first page means Apple may have more; a short one is the whole chart.
  // A pin from off the chart adds a row rather than pushing a chart show off the page.
  return { shows, stale: r.stale, hasMore: r.body.length >= CATEGORY_SHOWS, ...extra };
}
