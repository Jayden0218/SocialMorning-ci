// The owner's pins and hides on every list the phone shows (one table), and how they are applied.
/**
 * M25 A1 (specs/026-m25-control-security-release, lane AL). One table, `list_overrides`, holds
 * every pin and hide the owner puts on a list; this file reads and writes it and applies it.
 *
 * An item is a show (`feedUrl`, no guid), one episode (`feedUrl` + `guid`) or — on "What
 * listeners said" — one comment (`commentId`). A hide with no guid hides every episode of that
 * show from the list; a pin with no guid on an episode list means the show's newest episode.
 *
 * A pin's `position` is its 1-based slot in the list (no position = its place among the pins, in
 * the order they were made). A row counts only between `startsAt` and `endsAt` (each optional).
 * Applied at SERVE time, after any cache, so a change shows on the next request.
 *
 * Replaces M15's `trending_pins`, `trending_hides` and `category_features` (migration 028 copies
 * them in; the old tables are kept, unread, until a later cleanup).
 *
 * M26 lane DV: on DynamoDB each list is ONE document item (`LIST#<listId>`, ddb/lists.ts) — a save is one
 * conditional write, a racing save gets 409 `changed` (guard G-M26-DV1). The checks below run on both backends.
 */
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { ApiError } from '../../../errors.ts';
import type { EpisodeCard, ShowCard } from '../../../catalog/apple.ts';
import { genreName } from '../../../catalog/genres.ts';
import { pickEpisodeRows } from './pick-episodes.ts';
import { swallow } from '../../../log.ts';

export type ItemKind = 'show' | 'episode' | 'comment';
export type ListInfo = { id: string; label: string; item: ItemKind; pins: boolean; where: string };

/** Every list Admin › Lists can pin to or hide from. `category:<genreId>` lists are added per genre. */
export const LISTS: readonly ListInfo[] = [
  { id: 'trending', label: 'Charts › Top', item: 'episode', pins: true, where: 'Discover chart card, Top tab' },
  { id: 'talked', label: 'Talked about', item: 'episode', pins: true, where: 'Discover chart card tab + the full Talked about chart' },
  { id: 'new', label: 'New shows', item: 'show', pins: true, where: 'Discover chart card tab + the full New shows chart' },
  { id: 'rising', label: 'Rising', item: 'episode', pins: true, where: 'The full Rising chart' },
  { id: 'popular', label: 'Popular shows', item: 'show', pins: true, where: 'Discover' },
  { id: 'premium', label: 'Premium picks', item: 'show', pins: true, where: 'Discover' },
  { id: 'arrivals', label: 'New arrivals', item: 'show', pins: true, where: 'Discover' },
  { id: 'video', label: 'Podcasts you can watch', item: 'episode', pins: true, where: 'Discover' },
  { id: 'hunt', label: 'Treasure hunt', item: 'episode', pins: true, where: 'Discover (a pin is offered to everyone, every day)' },
  { id: 'plaza', label: 'Plaza', item: 'show', pins: true, where: 'The Plaza page (pins on the first page)' },
  { id: 'said', label: 'What listeners said', item: 'comment', pins: true, where: 'Discover' },
  { id: 'nextup', label: 'Next up', item: 'episode', pins: false, where: 'Episode page and player (hide only)' },
];

export const MAX_OVERRIDES_PER_LIST = 200;
export const categoryListId = (genreId: number) => `category:${genreId}`;

/** The list's description, or undefined when the id names no list. */
export function listInfo(listId: string): ListInfo | undefined {
  const fixed = LISTS.find((l) => l.id === listId);
  if (fixed) return fixed;
  const m = /^category:(\d{1,6})$/.exec(listId);
  if (!m) return undefined;
  const name = genreName(Number(m[1]));
  return name === undefined ? undefined : { id: listId, label: `Category › ${name}`, item: 'show', pins: true, where: 'Category page: For you, Hot and Newest' };
}

export type ItemRef = { feedUrl?: string; guid?: string; commentId?: string };
export type Override = {
  id: string; listId: string; kind: 'pin' | 'hide'; feedUrl?: string; guid?: string; commentId?: string;
  position: number | null; startsAt: string | null; endsAt: string | null; note: string | null; createdAt: string; live: boolean;
};
export type Active = { pins: Override[]; hides: Override[] };
export const NONE: Active = { pins: [], hides: [] };

/** Pins in slot order: slotted first by slot, then the rest by when they were made. */
export const pinOrder = (a: Override, b: Override) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt) || Number(a.id) - Number(b.id);

export async function active(db: Db, listId: string): Promise<Active> {
  return (await activeFor(db, [listId])).get(listId) ?? NONE;
}

/** Does override `o` name item `r`? A row with no guid names the whole show. */
export function names(o: ItemRef, r: ItemRef): boolean {
  if (o.commentId !== undefined) return r.commentId === o.commentId;
  return o.feedUrl !== undefined && r.feedUrl === o.feedUrl && (o.guid === undefined || r.guid === o.guid);
}

export const isHidden = (a: Active, r: ItemRef): boolean => a.hides.some((h) => names(h, r));

/**
 * The list with the owner's rows applied: hidden items out; each pin taken from the list when it
 * is there, else from `resolve` (a pinned item the list does not hold), and put at its slot.
 * `mark` dresses a pinned item (the category page's `pinned: true`). Pure apart from `resolve`.
 */
export async function applyList<T>(
  items: readonly T[], a: Active, ref: (t: T) => ItemRef,
  resolve: (o: Override) => Promise<T | undefined> = async () => undefined,
  mark: (t: T) => T = (t) => t,
): Promise<T[]> {
  if (a.pins.length === 0 && a.hides.length === 0) return [...items];
  const rest = items.filter((t) => !isHidden(a, ref(t)));
  const placed: { slot: number; item: T }[] = [];
  for (const [i, p] of a.pins.entries()) {
    const at = rest.findIndex((t) => names(p, ref(t)));
    let item: T | undefined;
    if (at >= 0) item = rest.splice(at, 1)[0];
    else {
      const got = await resolve(p).catch(swallow('discover_list_resolve_failed'));
      if (got !== undefined && !isHidden(a, ref(got)) && !placed.some((x) => sameItem(ref(x.item), ref(got)))) item = got;
    }
    if (item !== undefined) placed.push({ slot: p.position ?? i + 1, item: mark(item) });
  }
  const out = [...rest];
  for (const { slot, item } of placed.sort((x, y) => x.slot - y.slot)) out.splice(Math.min(Math.max(slot - 1, 0), out.length), 0, item);
  return out;
}

const sameItem = (x: ItemRef, y: ItemRef) => x.commentId === y.commentId && x.feedUrl === y.feedUrl && x.guid === y.guid;

// ---- Writes (Admin; every caller goes through adminWrite) ----

export type OverrideIn = { kind: 'pin' | 'hide'; feedUrl?: string; guid?: string; commentId?: string; position?: number | null; startsAt?: string | null; endsAt?: string | null; note?: string | null };
/** The row a write stores, after the checks (lane DV: the same value on both backends). */
export type OverrideRow = { kind: 'pin' | 'hide'; feedUrl: string | null; guid: string | null; commentId: string | null; position: number | null; startsAt: string | null; endsAt: string | null; note: string | null };

/** Adds a row; a row already on that item in that list (pin or hide) is replaced. */
export async function putOverride(tx: Db, listId: string, o: OverrideIn, by: string): Promise<Override> {
  const info = listInfo(listId);
  if (!info) throw new ApiError('not_found', 'No such list.');
  if (o.kind === 'pin' && !info.pins) throw new ApiError('validation', 'This list takes hides only.', { fields: ['kind'] });
  if (info.item === 'comment' ? o.commentId === undefined : o.feedUrl === undefined) {
    throw new ApiError('validation', info.item === 'comment' ? 'Choose a comment.' : 'Choose a show or an episode.', { fields: [info.item === 'comment' ? 'commentId' : 'feedUrl'] });
  }
  if (info.item === 'show' && o.guid !== undefined) throw new ApiError('validation', 'This list holds shows, not episodes.', { fields: ['guid'] });
  if (o.startsAt && o.endsAt && Date.parse(o.endsAt) <= Date.parse(o.startsAt)) throw new ApiError('validation', 'The end must be after the start.', { fields: ['endsAt'] });
  const row: OverrideRow = {
    kind: o.kind,
    feedUrl: info.item === 'comment' ? null : o.feedUrl ?? null,
    guid: info.item === 'comment' ? null : o.guid ?? null,
    commentId: info.item === 'comment' ? o.commentId ?? null : null,
    position: o.kind === 'pin' ? o.position ?? null : null, startsAt: o.startsAt ?? null, endsAt: o.endsAt ?? null, note: o.note ?? null,
  };
  return storeOverride(tx, listId, row, by);
}

export const tooManyRows = () => new ApiError('validation', `At most ${MAX_OVERRIDES_PER_LIST} rows on one list.`);

export async function deleteOverride(tx: Db, listId: string, id: string): Promise<boolean> {
  if (!/^\d{1,18}$/.test(id)) return false;
  return deleteOverrideRow(tx, listId, id);
}

// ---- Per-list settings (A2: the category page's default chip) ----

export const DEFAULT_TABS = ['forYou', 'all', 'newest'] as const;
export type DefaultTab = (typeof DEFAULT_TABS)[number];

// ---- Pinned items a list does not hold (from what the server already knows; no feed fetch) ----

type EpRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at?: Date | string | null };

const epCard = (e: EpRow): EpisodeCard & { id: string } => ({
  id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url,
  ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}),
  ...(e.published_at !== null && e.published_at !== undefined ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
});

/** The pinned episode (or the show's newest visible one) as a card, unless the show or episode is hidden. */
export async function pinnedEpisode(db: Db, o: ItemRef, hiddenFeeds: ReadonlySet<string>, hiddenEps: ReadonlySet<string>): Promise<(EpisodeCard & { id: string }) | undefined> {
  if (o.feedUrl === undefined || hiddenFeeds.has(o.feedUrl)) return undefined;
  const [e] = await pickEpisodeRows(db, o.feedUrl, o.guid, o.guid === undefined);
  if (!e || hiddenEps.has(e.id)) return undefined;
  return epCard(e);
}

/** A show's own words the server keeps: its parsed feed's show block (cache `feed:<url>`), and a live Studio show. */
export type ShowSources = { feed?: { title?: string; author?: string; imageUrl?: string }; hosted?: { title: string; author: string; cover_url: string | null } };

/** A show card for a pinned show: the parsed feed the server cached, else its newest registered episode, else a Studio show. */
export async function pinnedShow(db: Db, feedUrl: string | undefined, hiddenFeeds: ReadonlySet<string>): Promise<ShowCard | undefined> {
  if (feedUrl === undefined || hiddenFeeds.has(feedUrl)) return undefined;
  const src = await showSources(db, feedUrl);
  let title: string | undefined = src.feed?.title || undefined;
  let author: string | undefined = src.feed?.author || undefined;
  let imageUrl: string | undefined = src.feed?.imageUrl || undefined;
  const [ep] = await pickEpisodeRows(db, feedUrl, undefined, true);
  if (!title) {
    const hs = src.hosted;
    title = hs?.title ?? ep?.show_title ?? undefined;
    author = author ?? hs?.author;
    imageUrl = imageUrl ?? hs?.cover_url ?? ep?.image_url ?? undefined;
  }
  if (!title) return undefined;
  return {
    feedUrl, title, author: author ?? '', genres: [], ...(imageUrl ? { imageUrl } : {}),
    ...(ep ? { latestEpisode: { title: ep.title, ...(ep.published_at !== null && ep.published_at !== undefined ? { publishedAt: new Date(ep.published_at).toISOString() } : {}) } } : {}),
  };
}

// Each runs its DynamoDB body (ddb/lists.ts) on the Store the Db carries (db/backend.ts).
export const listOverrides = viaStore<typeof import('./ddb/lists.ts').listOverrides>('dv/lists', 'listOverrides');
export const activeFor = viaStore<typeof import('./ddb/lists.ts').activeFor>('dv/lists', 'activeFor');
export const storeOverride = viaStore<typeof import('./ddb/lists.ts').storeOverride>('dv/lists', 'storeOverride');
export const deleteOverrideRow = viaStore<typeof import('./ddb/lists.ts').deleteOverrideRow>('dv/lists', 'deleteOverrideRow');
export const replaceKind = viaStore<typeof import('./ddb/lists.ts').replaceKind>('dv/lists', 'replaceKind');
export const defaultTab = viaStore<typeof import('./ddb/lists.ts').defaultTab>('dv/lists', 'defaultTab');
export const setDefaultTab = viaStore<typeof import('./ddb/lists.ts').setDefaultTab>('dv/lists', 'setDefaultTab');
export const showSources = viaStore<typeof import('./ddb/lists.ts').showSources>('dv/lists', 'showSources');
