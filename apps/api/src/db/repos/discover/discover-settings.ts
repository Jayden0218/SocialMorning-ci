// Applies the owner's Discover settings: section order and hidden sections; the M15 pin routes over list_overrides.
/**
 * M15 T034 — Discover control (FR-026–FR-029; research R4). Applied at SERVE time, after the
 * hour's cache, so a change shows on the next refresh (SC-007):
 *   - `layout` (section order + hidden ids) goes to the phone, which draws by it; ids unknown to
 *     the phone are ignored there;
 *   - M25 A1: trending pins/hides and category features now live in `list_overrides` (lists
 *     `trending` and `category:<genreId>`, db/repos/discover/lists.ts). The M15 routes still read
 *     and write them here, through that table.
 * Settings that cannot be read are skipped with a warning: today's Discover, no `layout` (FR-029).
 *
 * M25 A5: the bundled section ids are split — each thing the phone draws has its own switch:
 * `pickedShows` (was inside `forYou`), `theirLikes` (inside `picks`), `categories` (the strip
 * after `chart`), `premium` (inside `shows`), `hunt` (inside `newShows`, which is now New arrivals
 * alone). `followedHere` drew nothing and is gone. A layout saved before the split is mapped
 * forward on the phone and in the Studio (`SPLIT_FROM`): a new id it does not name sits right
 * after the id it was split from and, where it used to be hidden with it, stays hidden.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { active, categoryListId, replaceKind } from './lists.ts';

/**
 * The phone's section ids (apps/mobile/src/discover/sections.ts), in the DEFAULT order — the one
 * Admin › Discover starts from before a layout is saved. Fix F-S: the Editor's picks come first,
 * then For you (design Home-B). A layout the owner saved keeps its own order.
 */
export const SECTION_IDS = [
  'picks', 'theirLikes', 'forYou', 'pickedShows', 'chart', 'categories', 'shows', 'premium',
  'video', 'collections', 'said', 'newShows', 'hunt',
] as const;
/** M25 A5: new id → [the id it was split from, hidden with it in an old layout?]. */
export const SPLIT_FROM: Readonly<Record<string, readonly [string, boolean]>> = {
  theirLikes: ['picks', true], pickedShows: ['forYou', true], categories: ['chart', false], premium: ['shows', true], hunt: ['newShows', true],
};
export const MAX_PINS = 3;
export const MAX_FEATURES = 5;

export type EpisodeRef = { feedUrl: string; guid?: string };
export type DiscoverSettings = { version: number; order: string[]; hidden: string[]; pins: EpisodeRef[]; hides: { feedUrl: string; guid: string }[] };
export type Layout = { version: number; order: string[]; hidden: string[] };

const known = (ids: readonly string[]) => [...new Set(ids.filter((x) => (SECTION_IDS as readonly string[]).includes(x)))];

/** The saved layout, or undefined when none was ever saved. Throws when it cannot be read (the caller skips it). */
export async function getLayout(db: Db): Promise<Layout | undefined> {
  const [row] = await db.query<{ section_order: string[] | string; hidden_sections: string[] | string; version: number }>('SELECT section_order, hidden_sections, version FROM discover_settings WHERE id = 1');
  return row ? { version: Number(row.version), order: textArray(row.section_order), hidden: textArray(row.hidden_sections) } : undefined;
}

export async function getDiscoverSettings(db: Db): Promise<DiscoverSettings> {
  const [layout, trending] = await Promise.all([getLayout(db), active(db, 'trending')]);
  return {
    version: layout?.version ?? 0, order: layout?.order ?? [], hidden: layout?.hidden ?? [],
    pins: trending.pins.filter((p) => p.feedUrl !== undefined).map((p) => ({ feedUrl: p.feedUrl!, ...(p.guid ? { guid: p.guid } : {}) })),
    hides: trending.hides.filter((h) => h.feedUrl !== undefined && h.guid !== undefined).map((h) => ({ feedUrl: h.feedUrl!, guid: h.guid! })),
  };
}

/** A text[] comes back as an array from both drivers; a literal `{a,b}` string is read defensively. */
function textArray(v: string[] | string): string[] {
  if (Array.isArray(v)) return v;
  const inner = v.replace(/^\{|\}$/g, '');
  return inner === '' ? [] : inner.split(',').map((s) => s.replace(/^"|"$/g, ''));
}

/**
 * Saves the layout; `pins`/`hides` (the M15 body) replace the `trending` list's rows when sent.
 * M25: the Studio's Discover page no longer sends them (Admin › Lists edits `trending`).
 */
export async function putDiscoverSettings(tx: Db, s: { version: number; order: string[]; hidden: string[]; pins?: EpisodeRef[]; hides?: { feedUrl: string; guid: string }[] }, by: string | null = null): Promise<number> {
  if (s.pins && s.pins.length > MAX_PINS) throw new ApiError('validation', `At most ${MAX_PINS} pinned episodes.`, { fields: ['pins'] });
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM discover_settings WHERE id = 1 FOR UPDATE');
  const current = cur ? Number(cur.version) : 0;
  if (current !== s.version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  const next = current + 1;
  await tx.query(
    `INSERT INTO discover_settings (id, section_order, hidden_sections, version) VALUES (1, $1::text[], $2::text[], $3)
     ON CONFLICT (id) DO UPDATE SET section_order = EXCLUDED.section_order, hidden_sections = EXCLUDED.hidden_sections, version = EXCLUDED.version`,
    [known(s.order), known(s.hidden), next],
  );
  if (s.pins) await replaceKind(tx, 'trending', 'pin', s.pins, by);
  if (s.hides) await replaceKind(tx, 'trending', 'hide', s.hides, by);
  return next;
}

/** M15 "featured in a category": the `category:<genreId>` list's pins, in slot order. */
export async function getFeatures(db: Db, genreId: number): Promise<string[]> {
  return (await active(db, categoryListId(genreId))).pins.flatMap((p) => (p.feedUrl ? [p.feedUrl] : []));
}

export async function putFeatures(tx: Db, genreId: number, feedUrls: readonly string[], by: string | null = null): Promise<void> {
  if (feedUrls.length > MAX_FEATURES) throw new ApiError('validation', `At most ${MAX_FEATURES} featured shows.`, { fields: ['shows'] });
  await replaceKind(tx, categoryListId(genreId), 'pin', [...new Set(feedUrls)].map((feedUrl) => ({ feedUrl })), by);
}
