// Explore lists: the three charts, the treasure hunt, the new-shows plaza, and followed faces on picks.
/**
 * M21 US7 (specs/022-m21-the-xiaoyuzhou-gaps, T080). Everything here is computed from the
 * episodes the server already knows; nothing fetches a feed. Counts only, never names, except
 * `likedBy`, which shows a viewer the faces of people they follow (likes are public by choice,
 * M19 `likes_public`). A show the owner hid is left out of every list (M6 FR-014).
 *
 * The three charts, in plain words (the phone's chart-rules page says the same):
 * - talked — "Talked about": listens, comments, clips and reactions in the last 7 days, weighted
 *   3/2/2/1 (Discover's ranking, M5 R4).
 * - new — "New shows": shows whose earliest episode the server knows of is the most recent. A
 *   show the server met through one late episode looks new; that is the limit of what we store.
 * - rising — "Rising": listens plus comments in the last 7 days minus the 7 days before; only
 *   episodes that grew, biggest growth first.
 * Each chart is cached for 5 minutes (`CHART_TTL`), so "Updated" on the phone is at most 5 min old.
 *
 * The treasure hunt and the plaza are OUR OWN DESIGN (owner, 2026-10-06), not a copy of 小宇宙.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';
import { cached } from '../cache.ts';
import { hiddenFeedUrls } from '../safety/moderation.ts';
import { hiddenEpisodeIds } from '../studio/hidden-episodes.ts';
import { talkedAboutChart, type DiscoverItem } from './discover.ts';
import { applyList, isHidden, NONE, pinnedEpisode, type Active } from './lists.ts';

export const CHART_KINDS = ['talked', 'new', 'rising'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export type ChartItem = DiscoverItem & { rank: number };
export const CHART_TTL = 5 * 60_000;
const CHART_STORED = 100;

export type EpRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at: Date | string | null };
const keyOf = (c: { feedUrl: string; guid: string }) => `${c.feedUrl}\u0001${c.guid}`;

export function cardOf(e: EpRow): EpisodeCard & { id: string } {
  return {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url,
    ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}),
    ...(e.published_at !== null ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
  };
}

/** One chart, cached 5 min; `updatedAt` is when this copy was computed. */
/** M25 A4: the `list_overrides` list each chart obeys (`new` is a list of shows). */
export const CHART_LIST: Readonly<Record<ChartKind, string>> = { talked: 'talked', new: 'new', rising: 'rising' };

export async function chart(db: Db, kind: ChartKind, limit: number, now: () => number = Date.now, ov: Active = NONE): Promise<{ items: ChartItem[]; updatedAt: string }> {
  const { body } = await cached(db, `chart:v1:${kind}`, CHART_TTL, async () => ({
    items: kind === 'talked' ? await talkedAboutChart(db, CHART_STORED) : kind === 'new' ? await newShowsChart(db) : await risingChart(db),
    updatedAt: new Date(now()).toISOString(),
  }), now);
  // M6 G7: a show hidden after this copy was made leaves at once, not 5 min later.
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db); // M24 US11: hidden episodes leave this list.
  const visible = body.items.filter((i) => !hidden.has(i.episode.feedUrl) && !hiddenEps.has(i.episode.id));
  // M25 A4: the owner's pins and hides, at serve time (after the 5-minute copy).
  const showLevel = kind === 'new';
  const applied = await applyList(visible, ov, (i) => (showLevel ? { feedUrl: i.episode.feedUrl } : { feedUrl: i.episode.feedUrl, guid: i.episode.guid }), async (p) => {
    const e = await pinnedEpisode(db, showLevel ? { feedUrl: p.feedUrl } : p, hidden, hiddenEps);
    return e ? { kind: 'trending' as const, key: keyOf(e), episode: e, reason: 'Picked by the editors', rank: 0 } : undefined;
  });
  const items = applied.slice(0, limit).map((i, n) => ({ ...i, rank: n + 1 }));
  return { items, updatedAt: body.updatedAt };
}

/** A stable order for a seed: the same seed always gives the same order (no Math.random). */
export function seededOrder<T>(items: readonly T[], seed: string, idOf: (t: T) => string): T[] {
  // SHA-256, not FNV-1a: a seed that differs in one character (the next day) must reorder the
  // whole list, and FNV's last-byte mixing left it unchanged (gate 37442959667).
  const key = (id: string): string => createHash('sha256').update(`${seed}\u0001${id}`).digest('hex').slice(0, 16);
  return items.map((t) => ({ t, k: key(idOf(t)) })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)).map((x) => x.t);
}

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
export const HUNT_SIZE = 3;

/**
 * Treasure hunt (OUR OWN DESIGN, owner 2026-10-06): 3 lesser-heard episodes from 3 different
 * shows. Candidates: episodes with audio, in the bottom half by plays (distinct listeners over 30
 * days; the candidates ordered by plays, then id, and the first half kept — ties cut by id), from shows the listener does not subscribe to and did not turn down (`rec_dismissals`,
 * show or episode). The pick is seeded by (listener, UTC day, shuffle), so it holds all day and
 * changes the next day; `shuffle = n` gives the n-th other set.
 */
export async function hunt(db: Db, listenerId: string | undefined, day: string, shuffle: number, ov: Active = NONE): Promise<(EpisodeCard & { id: string })[]> {
  const rows = await huntRows(db, listenerId ?? null);
  // M25 A4: the owner's hides leave the candidates; the owner's pins (hidden gems) come first, for everyone.
  const order = seededOrder(rows.filter((r) => !isHidden(ov, { feedUrl: r.feed_url, guid: r.guid })), `hunt|${listenerId ?? 'anon'}|${day}|${shuffle}`, (r) => r.id);
  const pinned: (EpisodeCard & { id: string })[] = [];
  if (ov.pins.length > 0) {
    const hiddenFeeds = await hiddenFeedUrls(db);
    const hiddenEps = await hiddenEpisodeIds(db);
    for (const p of ov.pins) {
      const e = await pinnedEpisode(db, p, hiddenFeeds, hiddenEps);
      if (e && !pinned.some((x) => x.feedUrl === e.feedUrl)) pinned.push(e);
    }
  }
  const out: (EpisodeCard & { id: string })[] = pinned.slice(0, HUNT_SIZE);
  const shows = new Set<string>(out.map((e) => e.feedUrl));
  for (const r of order) {
    if (out.length >= HUNT_SIZE) break;
    if (shows.has(r.feed_url)) continue;
    shows.add(r.feed_url);
    out.push(cardOf(r));
  }
  return out;
}

export type PlazaShow = { feedUrl: string; title: string; imageUrl?: string; episodes: number; firstAt: string };
export const PLAZA_POOL = 600;
export const PLAZA_PAGE = 60;

export type PlazaRow = { feed_url: string; title: string | null; image_url: string | null; episodes: number; first_at: Date | string };

/**
 * New-shows plaza (OUR OWN DESIGN, owner 2026-10-06): the newest PLAZA_POOL shows (by the
 * earliest episode known), put in a seeded order per (listener, day, shuffle), served
 * PLAZA_PAGE at a time. `cursor` is the offset of the next page.
 */
export async function plaza(db: Db, seed: string, cursor: number, ov: Active = NONE): Promise<{ items: PlazaShow[]; next?: string }> {
  const hidden = await hiddenFeedUrls(db);
  const rows = await plazaRows(db);
  const pool = rows.filter((r) => !hidden.has(r.feed_url));
  // M25 A4: the owner's hides leave the plaza; pins open its first page, in the owner's order.
  const seeded = seededOrder(pool, `plaza|${seed}`, (r) => r.feed_url);
  const order = await applyList(seeded, ov, (r) => ({ feedUrl: r.feed_url }), async (p) => {
    if (p.feedUrl === undefined || hidden.has(p.feedUrl)) return undefined;
    return plazaRow(db, p.feedUrl);
  });
  const slice = order.slice(cursor, cursor + PLAZA_PAGE);
  return {
    items: slice.map((r) => ({ feedUrl: r.feed_url, title: r.title ?? '', ...(r.image_url ? { imageUrl: r.image_url } : {}), episodes: Number(r.episodes), firstAt: new Date(r.first_at).toISOString() })),
    ...(cursor + PLAZA_PAGE < order.length ? { next: String(cursor + PLAZA_PAGE) } : {}),
  };
}

export type Face = { id: string; displayName: string; avatarUrl?: string };
export const FACES_MAX = 3;


// Each runs its DynamoDB body (ddb/explore.ts) on the Store the Db carries (db/backend.ts).
export const newShowsChart = viaStore<typeof import('./ddb/explore.ts').newShowsChart>('dv/explore', 'newShowsChart');
export const risingChart = viaStore<typeof import('./ddb/explore.ts').risingChart>('dv/explore', 'risingChart');
export const huntRows = viaStore<typeof import('./ddb/explore.ts').huntRows>('dv/explore', 'huntRows');
export const plazaRows = viaStore<typeof import('./ddb/explore.ts').plazaRows>('dv/explore', 'plazaRows');
export const plazaRow = viaStore<typeof import('./ddb/explore.ts').plazaRow>('dv/explore', 'plazaRow');
export const likedByFollowed = viaStore<typeof import('./ddb/explore.ts').likedByFollowed>('dv/explore', 'likedByFollowed');
