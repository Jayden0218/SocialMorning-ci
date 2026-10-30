// Lists Apple's podcast categories with their icons.
/**
 * Apple's top-level podcast genres (the ids `toppodcasts/genre=` accepts; the server's
 * `catalog/genres.ts` has the same ids). Kept on the phone so the category strip draws
 * without a network call. `icon` is the tile's one-colour picture (Ionicons; owner 2026-09-27:
 * one-colour icons across the app, no colour emoji).
 */
import { orderedVisible, type GenreSetting } from '@socialmorning/social-core';
import type { IconName } from '@/ui/kit/Icon';

export type Genre = { id: number; name: string; icon: IconName };

/** The bundled list, in the bundled order, with Apple's names (what `genreOf` matches feeds against). */
export const BUNDLED_GENRES: readonly Genre[] = [
  { id: 1321, name: 'Business', icon: 'briefcase-outline' },
  { id: 1324, name: 'Society & Culture', icon: 'earth-outline' },
  { id: 1304, name: 'Education', icon: 'school-outline' },
  { id: 1303, name: 'Comedy', icon: 'happy-outline' },
  { id: 1489, name: 'News', icon: 'newspaper-outline' },
  { id: 1318, name: 'Technology', icon: 'hardware-chip-outline' },
  { id: 1533, name: 'Science', icon: 'flask-outline' },
  { id: 1512, name: 'Health & Fitness', icon: 'fitness-outline' },
  { id: 1487, name: 'History', icon: 'hourglass-outline' },
  { id: 1301, name: 'Arts', icon: 'color-palette-outline' },
  { id: 1488, name: 'True Crime', icon: 'finger-print-outline' },
  { id: 1483, name: 'Fiction', icon: 'book-outline' },
  { id: 1309, name: 'TV & Film', icon: 'film-outline' },
  { id: 1310, name: 'Music', icon: 'musical-notes-outline' },
  { id: 1545, name: 'Sports', icon: 'football-outline' },
  { id: 1502, name: 'Leisure', icon: 'game-controller-outline' },
  { id: 1305, name: 'Kids & Family', icon: 'balloon-outline' },
  { id: 1314, name: 'Religion & Spirituality', icon: 'sparkles-outline' },
  { id: 1511, name: 'Government', icon: 'business-outline' },
];

/** Every genre with the admin's name (M25 A7), hidden or not — for looking one up by id. */
const ALL: Genre[] = BUNDLED_GENRES.map((g) => ({ ...g }));
const VISIBLE: Genre[] = [...ALL];

/**
 * The categories the app shows — strip, grid, categories page, first-open interests — in order.
 * M25 A7: the admin may rename, reorder and hide them (`app_config` key `genres`); the bundled
 * list is the default and the offline fallback. `applyGenreSettings` changes this array IN PLACE
 * (so every screen that reads `GENRES` sees it on its next draw) and never leaves it empty.
 */
export const GENRES: readonly Genre[] = VISIBLE;

export function applyGenreSettings(saved: readonly GenreSetting[]): void {
  const named = BUNDLED_GENRES.map((g) => ({ ...g, name: saved.find((r) => r.id === g.id)?.name ?? g.name }));
  ALL.splice(0, ALL.length, ...named);
  const shown = orderedVisible(BUNDLED_GENRES.map((g) => g.id), saved).map((x) => named.find((g) => g.id === x.id)!);
  VISIBLE.splice(0, VISIBLE.length, ...(shown.length > 0 ? shown : named));
}

export const genreById = (id: number): Genre | undefined => ALL.find((g) => g.id === id);

/**
 * M12 FR-063: the genre a feed names in its categories (`itunes:category` text, the same
 * names Apple uses), first match wins; undefined when none is one of Apple's top-level ones.
 */
export function genreOf(categories: readonly string[] | undefined): Genre | undefined {
  for (const c of categories ?? []) {
    const name = c.trim().toLowerCase().replace(/&amp;/g, '&');
    const g = BUNDLED_GENRES.find((x) => x.name.toLowerCase() === name);
    if (g) return genreById(g.id);
  }
  return undefined;
}

/** Up to `max` other shows from a genre chart: not this one, not a hidden one. */
export function similarShows<T extends { feedUrl: string }>(shows: readonly T[], self: string, hidden: ReadonlySet<string>, max = 6): T[] {
  return shows.filter((s) => s.feedUrl !== self && !hidden.has(s.feedUrl)).slice(0, max);
}
