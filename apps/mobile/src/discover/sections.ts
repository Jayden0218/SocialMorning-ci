// Works out which Discover sections to show from the server's data.
/**
 * What the redesigned Discover (M10, owner 2026-09-27) shows, worked out from the data —
 * kept apart from the screen so it can be tested without rendering.
 *
 * The rule for every section: **no data, no section**. An older server leaves the new
 * fields out; a section the server could not build arrives empty; either way the screen
 * skips it instead of drawing an empty frame. Nothing is invented to fill a gap.
 */
import type { Collection, Discover, DiscoverItem, EpisodeCard, ForYou, SaidItem, ShowCard } from '@/social/api';
import { plural } from '@socialmorning/social-core';

export type ChartTab = { key: 'top' | 'talked' | 'new'; label: string; rows: EpisodeCard[] };

export type DiscoverModel = {
  forYou: { card: EpisodeCard; line: string; index: number }[];
  picks: DiscoverItem[];
  chart: ChartTab[];
  shows: ShowCard[];
  collections: Collection[];
  said: SaidItem[];
  newShows: { show: ShowCard; episode: EpisodeCard }[];
  /** Owner, 2026-10-05: drawn after "Popular shows" and in the `newShows` slot. */
  premium: ShowCard[];
  arrivals: { show: ShowCard; episode: EpisodeCard }[];
  /** M10b US5: "Podcasts you can watch". */
  video: DiscoverItem[];
  /** M15 US5: the sections to draw, top to bottom — the owner's order, hidden ones left out. */
  order: SectionId[];
};

/**
 * M15 US5 (data-model.md `discover_settings`): the section ids the owner orders and hides
 * in the Studio, in today's order. `collections` is every collection as one block.
 */
export const SECTION_IDS = ['forYou', 'picks', 'chart', 'shows', 'video', 'collections', 'followedHere', 'said', 'newShows'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const isSectionId = (v: unknown): v is SectionId => typeof v === 'string' && (SECTION_IDS as readonly string[]).includes(v);

/**
 * The owner's order with the hidden sections removed (guard G-D1). Unknown ids are ignored;
 * a known section the owner's order leaves out keeps its place after the listed ones; a
 * missing or unreadable `layout` is today's order (FR-029).
 */
export function sectionOrder(layout: Discover['layout'] | undefined): SectionId[] {
  const rawOrder: unknown = layout?.order;
  const rawHidden: unknown = layout?.hidden;
  const order = Array.isArray(rawOrder) ? rawOrder.filter(isSectionId) : [];
  const hidden = new Set(Array.isArray(rawHidden) ? rawHidden.filter(isSectionId) : []);
  const listed = [...new Set(order)];
  return [...listed, ...SECTION_IDS.filter((id) => !listed.includes(id))].filter((id) => !hidden.has(id));
}

/** What the viewer has hidden: shows (owner or own), and blocked listeners. */
export type Hidden = { feeds: ReadonlySet<string>; blocked: ReadonlySet<string> };

/** Splits a list into pages of `n` — the swipeable columns of 3 rows. */
export function pages<T>(items: readonly T[], n = 3): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function buildModel(body: Discover | undefined, forYou: ForYou | undefined, hidden: Hidden): DiscoverModel {
  const keepCard = (c: EpisodeCard) => !hidden.feeds.has(c.feedUrl);
  const keepItem = (i: DiscoverItem) => keepCard(i.episode);
  const picks = (body?.picks ?? []).filter(keepItem);
  const newShows = (body?.newShows ?? []).filter((n) => keepCard(n.episode) && !hidden.feeds.has(n.show.feedUrl));
  const arrivals = (body?.newArrivals ?? []).filter((n) => keepCard(n.episode) && !hidden.feeds.has(n.show.feedUrl));
  // Owner, 2026-10-05: always the three tabs (an empty one says so). "New shows" is the chart's
  // new shows, or — when the chart has none — the newest shows made here.
  const chart: ChartTab[] = [
    { key: 'top' as const, label: 'Top', rows: (body?.trending ?? []).filter(keepItem).map((i) => i.episode) },
    { key: 'talked' as const, label: 'Talked about', rows: (body?.talkedAbout ?? []).filter(keepItem).map((i) => i.episode) },
    { key: 'new' as const, label: 'New shows', rows: (newShows.length > 0 ? newShows : arrivals).map((n) => n.episode) },
  ];
  const anyChart = chart.some((t) => t.rows.length > 0);
  const order = sectionOrder(body?.layout);
  // A hidden section is emptied as well as left out of `order`, so no path draws it.
  const on = (id: SectionId): boolean => order.includes(id);
  return {
    forYou: on('forYou') ? (forYou?.items ?? []).map((i, index) => ({ card: i.episode as EpisodeCard, line: i.reason, index })).filter((r) => keepCard(r.card)) : [],
    picks: on('picks') ? picks : [],
    chart: on('chart') && anyChart ? chart : [],
    shows: on('shows') ? (body?.shows ?? []).filter((s) => !hidden.feeds.has(s.feedUrl)).slice(0, 6) : [],
    // Owner, 2026-10-05: "Where to start" (the collections) and "Shows listeners here follow" are
    // no longer drawn; their ids stay so a saved Studio order still reads.
    collections: [],
    said: on('said') ? (body?.said ?? []).filter((s) => !hidden.blocked.has(s.authorId) && keepCard(s.episode)) : [],
    newShows: on('newShows') ? newShows : [],
    premium: on('shows') ? (body?.premium ?? []).filter((s) => !hidden.feeds.has(s.feedUrl)).slice(0, 6) : [],
    arrivals: on('newShows') ? arrivals : [],
    video: on('video') ? (body?.video ?? []).filter(keepItem).slice(0, 10) : [],
    order,
  };
}

/** "12 listened · 3 comments" — counts only; an empty string when there is nothing to say. */
export function statsLine(stats: DiscoverItem['stats']): string {
  if (!stats) return '';
  const parts: string[] = [];
  if (stats.listeners > 0) parts.push(`${stats.listeners} listened`);
  if (stats.comments > 0) parts.push(`${plural(stats.comments, 'comment')}`);
  return parts.join(' · ');
}

/** "11 h ago", "3 d ago" — for the comment cards. */
export function ago(iso: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** M12 FR-070 (past picks): "2026-09-22" → "Tue 22 Sep 2026" — the date as written, never shifted by the phone's zone. */
export function dayTitle(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
