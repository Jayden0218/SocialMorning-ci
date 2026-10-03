// Applies the owner's Discover settings: section order, hidden items, pinned and featured shows.
/**
 * M15 T034 — Discover control (FR-026–FR-029; research R4). Applied at SERVE time, after the
 * hour's cache, so a change shows on the next refresh (SC-007):
 *   - `layout` (section order + hidden ids) goes to the phone, which draws by it; ids unknown to
 *     the phone are ignored there;
 *   - trending pins (≤ 3) go first, trending hides are removed;
 *   - category features (≤ 5 shows) go first in `/v1/categories/:id`.
 * Settings that cannot be read are skipped with a warning: today's Discover, no `layout` (FR-029).
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

/** The phone's section ids (apps/mobile/src/discover/sections.ts). */
export const SECTION_IDS = ['forYou', 'picks', 'chart', 'shows', 'video', 'collections', 'followedHere', 'said', 'newShows'] as const;
export const MAX_PINS = 3;
export const MAX_FEATURES = 5;

export type EpisodeRef = { feedUrl: string; guid?: string };
export type DiscoverSettings = { version: number; order: string[]; hidden: string[]; pins: EpisodeRef[]; hides: { feedUrl: string; guid: string }[] };

const known = (ids: readonly string[]) => [...new Set(ids.filter((x) => (SECTION_IDS as readonly string[]).includes(x)))];

export async function getDiscoverSettings(db: Db): Promise<DiscoverSettings> {
  const [[row], pins, hides] = await Promise.all([
    db.query<{ section_order: string[] | string; hidden_sections: string[] | string; version: number }>('SELECT section_order, hidden_sections, version FROM discover_settings WHERE id = 1'),
    db.query<{ feed_url: string; guid: string | null }>('SELECT feed_url, guid FROM trending_pins ORDER BY position'),
    db.query<{ feed_url: string; guid: string }>('SELECT feed_url, guid FROM trending_hides ORDER BY feed_url, guid'),
  ]);
  return {
    version: row ? Number(row.version) : 0,
    order: row ? textArray(row.section_order) : [],
    hidden: row ? textArray(row.hidden_sections) : [],
    pins: pins.map((p) => ({ feedUrl: p.feed_url, ...(p.guid ? { guid: p.guid } : {}) })),
    hides: hides.map((h) => ({ feedUrl: h.feed_url, guid: h.guid })),
  };
}

/** Whether the owner has ever saved a layout — only then does the phone get one. */
export async function hasLayout(db: Db): Promise<boolean> {
  return (await db.query('SELECT 1 FROM discover_settings WHERE id = 1')).length > 0;
}

/** A text[] comes back as an array from both drivers; a literal `{a,b}` string is read defensively. */
function textArray(v: string[] | string): string[] {
  if (Array.isArray(v)) return v;
  const inner = v.replace(/^\{|\}$/g, '');
  return inner === '' ? [] : inner.split(',').map((s) => s.replace(/^"|"$/g, ''));
}

export async function putDiscoverSettings(tx: Db, s: Omit<DiscoverSettings, 'version'> & { version: number }): Promise<number> {
  if (s.pins.length > MAX_PINS) throw new ApiError('validation', `At most ${MAX_PINS} pinned episodes.`, { fields: ['pins'] });
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM discover_settings WHERE id = 1 FOR UPDATE');
  const current = cur ? Number(cur.version) : 0;
  if (current !== s.version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  const next = current + 1;
  await tx.query(
    `INSERT INTO discover_settings (id, section_order, hidden_sections, version) VALUES (1, $1::text[], $2::text[], $3)
     ON CONFLICT (id) DO UPDATE SET section_order = EXCLUDED.section_order, hidden_sections = EXCLUDED.hidden_sections, version = EXCLUDED.version`,
    [known(s.order), known(s.hidden), next],
  );
  await tx.query('DELETE FROM trending_pins');
  for (const [i, p] of s.pins.entries()) await tx.query('INSERT INTO trending_pins (position, feed_url, guid) VALUES ($1, $2, $3)', [i + 1, p.feedUrl, p.guid ?? null]);
  await tx.query('DELETE FROM trending_hides');
  for (const h of s.hides) await tx.query('INSERT INTO trending_hides (feed_url, guid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [h.feedUrl, h.guid]);
  return next;
}

export async function getFeatures(db: Db, genreId: number): Promise<string[]> {
  return (await db.query<{ feed_url: string }>('SELECT feed_url FROM category_features WHERE genre_id = $1 ORDER BY position', [genreId])).map((r) => r.feed_url);
}

export async function putFeatures(tx: Db, genreId: number, feedUrls: readonly string[]): Promise<void> {
  if (feedUrls.length > MAX_FEATURES) throw new ApiError('validation', `At most ${MAX_FEATURES} featured shows.`, { fields: ['shows'] });
  await tx.query('DELETE FROM category_features WHERE genre_id = $1', [genreId]);
  for (const [i, f] of [...new Set(feedUrls)].entries()) await tx.query('INSERT INTO category_features (genre_id, position, feed_url) VALUES ($1, $2, $3)', [genreId, i + 1, f]);
}

/** Featured shows first, in the owner's order; the rest keep the chart's order. Pure. */
export function featuredFirst<T extends { feedUrl: string }>(shows: readonly T[], featured: readonly string[], extra: (feedUrl: string) => T | undefined): T[] {
  const byFeed = new Map(shows.map((s) => [s.feedUrl, s]));
  const first: T[] = [];
  for (const f of featured) {
    const s = byFeed.get(f) ?? extra(f);
    if (s) first.push(s);
  }
  const taken = new Set(first.map((s) => s.feedUrl));
  return [...first, ...shows.filter((s) => !taken.has(s.feedUrl))];
}
