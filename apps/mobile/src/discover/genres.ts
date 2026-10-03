// Lists Apple's podcast categories with their icons.
/**
 * Apple's top-level podcast genres (the ids `toppodcasts/genre=` accepts; the server's
 * `catalog/genres.ts` has the same ids). Kept on the phone so the category strip draws
 * without a network call. `icon` is the tile's one-colour picture (Ionicons; owner 2026-09-27:
 * one-colour icons across the app, no colour emoji).
 */
import type { IconName } from '@/ui/kit/Icon';

export type Genre = { id: number; name: string; icon: IconName };

export const GENRES: readonly Genre[] = [
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

export const genreById = (id: number): Genre | undefined => GENRES.find((g) => g.id === id);

/**
 * M12 FR-063: the genre a feed names in its categories (`itunes:category` text, the same
 * names Apple uses), first match wins; undefined when none is one of Apple's top-level ones.
 */
export function genreOf(categories: readonly string[] | undefined): Genre | undefined {
  for (const c of categories ?? []) {
    const name = c.trim().toLowerCase().replace(/&amp;/g, '&');
    const g = GENRES.find((x) => x.name.toLowerCase() === name);
    if (g) return g;
  }
  return undefined;
}

/** Up to `max` other shows from a genre chart: not this one, not a hidden one. */
export function similarShows<T extends { feedUrl: string }>(shows: readonly T[], self: string, hidden: ReadonlySet<string>, max = 6): T[] {
  return shows.filter((s) => s.feedUrl !== self && !hidden.has(s.feedUrl)).slice(0, max);
}
