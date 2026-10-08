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
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import type { EpisodeCard, ShowCard } from '../../../catalog/apple.ts';
import { genreName } from '../../../catalog/genres.ts';
import { notHidden } from '../studio/hidden-episodes.ts';

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

type Row = { id: string | number; list_id: string; kind: 'pin' | 'hide'; feed_url: string | null; guid: string | null; comment_id: string | null; position: number | null; starts_at: Date | string | null; ends_at: Date | string | null; note: string | null; created_at: Date | string; live: boolean };
const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());
const LIVE = '((starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()))';
const COLS = `id, list_id, kind, feed_url, guid, comment_id::text AS comment_id, position, starts_at, ends_at, note, created_at, ${LIVE} AS live`;

const toOverride = (r: Row): Override => ({
  id: String(r.id), listId: r.list_id, kind: r.kind,
  ...(r.feed_url !== null ? { feedUrl: r.feed_url } : {}), ...(r.guid !== null ? { guid: r.guid } : {}), ...(r.comment_id !== null ? { commentId: r.comment_id } : {}),
  position: r.position === null ? null : Number(r.position), startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), note: r.note, createdAt: iso(r.created_at)!, live: Boolean(r.live),
});

/** Pins in slot order: slotted first by slot, then the rest by when they were made. */
const pinOrder = (a: Override, b: Override) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt) || Number(a.id) - Number(b.id);

/** Every row of one list, live or not (Admin). */
export async function listOverrides(db: Db, listId: string): Promise<Override[]> {
  const rows = await db.query<Row>(`SELECT ${COLS} FROM list_overrides WHERE list_id = $1 ORDER BY kind DESC, position NULLS LAST, created_at, id`, [listId]);
  return rows.map(toOverride);
}

/** The rows that count NOW for several lists, in one read. A list with none is `NONE`. */
export async function activeFor(db: Db, listIds: readonly string[]): Promise<Map<string, Active>> {
  const out = new Map<string, Active>();
  for (const id of listIds) out.set(id, { pins: [], hides: [] });
  if (listIds.length === 0) return out;
  const rows = await db.query<Row>(`SELECT ${COLS} FROM list_overrides WHERE list_id = ANY($1::text[]) AND ${LIVE}`, [[...listIds]]);
  for (const r of rows) {
    const o = toOverride(r);
    const a = out.get(o.listId)!;
    (o.kind === 'pin' ? a.pins : a.hides).push(o);
  }
  for (const a of out.values()) a.pins.sort(pinOrder);
  return out;
}

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
      const got = await resolve(p).catch(() => undefined);
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
  const [n] = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM list_overrides WHERE list_id = $1', [listId]);
  if (Number(n?.n ?? 0) >= MAX_OVERRIDES_PER_LIST) throw new ApiError('validation', `At most ${MAX_OVERRIDES_PER_LIST} rows on one list.`);
  const feed = info.item === 'comment' ? null : o.feedUrl ?? null;
  const guid = info.item === 'comment' ? null : o.guid ?? null;
  const comment = info.item === 'comment' ? o.commentId ?? null : null;
  await tx.query(
    `DELETE FROM list_overrides WHERE list_id = $1 AND COALESCE(feed_url, '') = COALESCE($2::text, '') AND COALESCE(guid, '') = COALESCE($3::text, '') AND COALESCE(comment_id::text, '') = COALESCE($4::text, '')`,
    [listId, feed, guid, comment],
  );
  const [row] = await tx.query<Row>(
    `INSERT INTO list_overrides (list_id, kind, feed_url, guid, comment_id, position, starts_at, ends_at, note, created_by)
     VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::timestamptz, $8::timestamptz, $9, $10) RETURNING ${COLS}`,
    [listId, o.kind, feed, guid, comment, o.kind === 'pin' ? o.position ?? null : null, o.startsAt ?? null, o.endsAt ?? null, o.note ?? null, by],
  );
  return toOverride(row!);
}

export async function deleteOverride(tx: Db, listId: string, id: string): Promise<boolean> {
  if (!/^\d{1,18}$/.test(id)) return false;
  const rows = await tx.query('DELETE FROM list_overrides WHERE list_id = $1 AND id = $2::bigint RETURNING id', [listId, id]);
  return rows.length > 0;
}

/** Replaces one kind of row on a list with `items` in order (slots 1…n for pins). For the M15 routes. */
export async function replaceKind(tx: Db, listId: string, kind: 'pin' | 'hide', items: readonly { feedUrl: string; guid?: string }[], by: string | null): Promise<void> {
  await tx.query('DELETE FROM list_overrides WHERE list_id = $1 AND kind = $2', [listId, kind]);
  for (const [i, it] of items.entries()) {
    await tx.query(
      `DELETE FROM list_overrides WHERE list_id = $1 AND feed_url = $2 AND COALESCE(guid, '') = COALESCE($3::text, '')`, [listId, it.feedUrl, it.guid ?? null]);
    await tx.query(
      'INSERT INTO list_overrides (list_id, kind, feed_url, guid, position, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [listId, kind, it.feedUrl, it.guid ?? null, kind === 'pin' ? i + 1 : null, by],
    );
  }
}

// ---- Per-list settings (A2: the category page's default chip) ----

export const DEFAULT_TABS = ['forYou', 'all', 'newest'] as const;
export type DefaultTab = (typeof DEFAULT_TABS)[number];

export async function defaultTab(db: Db, listId: string): Promise<DefaultTab | undefined> {
  const [r] = await db.query<{ default_tab: DefaultTab | null }>('SELECT default_tab FROM list_settings WHERE list_id = $1', [listId]);
  return r?.default_tab ?? undefined;
}

export async function setDefaultTab(tx: Db, listId: string, tab: DefaultTab | null): Promise<void> {
  await tx.query(
    `INSERT INTO list_settings (list_id, default_tab, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (list_id) DO UPDATE SET default_tab = EXCLUDED.default_tab, updated_at = now()`, [listId, tab]);
}

// ---- Pinned items a list does not hold (from what the server already knows; no feed fetch) ----

type EpRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at: Date | string | null; media_kind?: string | null };

const epCard = (e: EpRow): EpisodeCard & { id: string } => ({
  id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url,
  ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}),
  ...(e.published_at !== null ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
});

/** The pinned episode (or the show's newest visible one) as a card, unless the show or episode is hidden. */
export async function pinnedEpisode(db: Db, o: ItemRef, hiddenFeeds: ReadonlySet<string>, hiddenEps: ReadonlySet<string>): Promise<(EpisodeCard & { id: string }) | undefined> {
  if (o.feedUrl === undefined || hiddenFeeds.has(o.feedUrl)) return undefined;
  const cols = 'id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url, published_at';
  const [e] = o.guid !== undefined
    ? await db.query<EpRow>(`SELECT ${cols} FROM episodes WHERE feed_url = $1 AND guid = $2`, [o.feedUrl, o.guid])
    : await db.query<EpRow>(`SELECT ${cols} FROM episodes WHERE feed_url = $1 AND ${notHidden('episodes')} ORDER BY published_at DESC NULLS LAST, first_seen_at DESC LIMIT 1`, [o.feedUrl]);
  if (!e || hiddenEps.has(e.id)) return undefined;
  return epCard(e);
}

/** A show card for a pinned show: the parsed feed the server cached, else its newest registered episode, else a Studio show. */
export async function pinnedShow(db: Db, feedUrl: string | undefined, hiddenFeeds: ReadonlySet<string>): Promise<ShowCard | undefined> {
  if (feedUrl === undefined || hiddenFeeds.has(feedUrl)) return undefined;
  const [row] = await db.query<{ body: unknown }>('SELECT body FROM cache WHERE key = $1', [`feed:${feedUrl}`]);
  let title: string | undefined; let author: string | undefined; let imageUrl: string | undefined;
  if (row) {
    try {
      const b = (typeof row.body === 'string' ? JSON.parse(row.body) : row.body) as { show?: { title?: string; author?: string; imageUrl?: string } };
      title = b.show?.title || undefined; author = b.show?.author || undefined; imageUrl = b.show?.imageUrl || undefined;
    } catch { /* a cached body we cannot read: fall through */ }
  }
  const [ep] = await db.query<{ show_title: string | null; image_url: string | null; title: string; published_at: Date | string | null }>(
    `SELECT show_title, image_url, title, published_at FROM episodes WHERE feed_url = $1 AND ${notHidden('episodes')} ORDER BY published_at DESC NULLS LAST, first_seen_at DESC LIMIT 1`, [feedUrl]);
  if (!title) {
    const [hs] = await db.query<{ title: string; author: string; cover_url: string | null }>('SELECT title, author, cover_url FROM hosted_shows WHERE feed_url = $1 AND deleted_at IS NULL', [feedUrl]);
    title = hs?.title ?? ep?.show_title ?? undefined;
    author = author ?? hs?.author;
    imageUrl = imageUrl ?? hs?.cover_url ?? ep?.image_url ?? undefined;
  }
  if (!title) return undefined;
  return {
    feedUrl, title, author: author ?? '', genres: [], ...(imageUrl ? { imageUrl } : {}),
    ...(ep ? { latestEpisode: { title: ep.title, ...(ep.published_at !== null ? { publishedAt: new Date(ep.published_at).toISOString() } : {}) } } : {}),
  };
}
