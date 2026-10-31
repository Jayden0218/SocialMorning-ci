// Apple's top podcast genres, and matching a feed's category to a genre id.
/**
 * Apple's top-level podcast genres (the ids the `toppodcasts/genre=` chart accepts),
 * matched by name to a feed's `<itunes:category>` (M5 research R5). Unknown → undefined
 * → the all-genres chart.
 */
import { APPLE_CATEGORIES, categoryName } from '@socialmorning/social-core';

export const APPLE_GENRES: Record<string, number> = Object.fromEntries(APPLE_CATEGORIES.map((c) => [c.name.toLowerCase(), c.id]));

export function genreIdFor(categories: readonly string[]): { id: number; name: string } | undefined {
  for (const c of categories) {
    const key = c.trim().toLowerCase().replace(/\s*&amp;\s*/g, ' & ');
    const id = APPLE_GENRES[key];
    if (id !== undefined) return { id, name: c.trim() };
  }
  return undefined;
}

/**
 * M10: the display name for a genre id ("Health & Fitness", "TV & Film"), from the one list in social-core. Undefined for an id that is not an Apple top-level genre.
 */
export const genreName = categoryName;

/** M10: every top-level genre with its display name, in name order. */
export const GENRE_LIST: readonly { genreId: number; name: string }[] = Object.values(APPLE_GENRES)
  .map((id) => ({ genreId: id, name: genreName(id)! }))
  .sort((a, b) => a.name.localeCompare(b.name));
