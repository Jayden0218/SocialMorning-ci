// Apple's podcast categories (id and name) shared by the phone, the server and the Studio.
/**
 * Apple Podcasts' top-level categories (podcasters.apple.com/support/1691, read 2026-09-29).
 * `id` is Apple's genre id (what `toppodcasts/genre=` accepts); `name` is the exact text a
 * feed carries in `<itunes:category>`. The ONE list: the Studio's pickers, the server's
 * genre matching and the phone's category strip all derive from it, so they cannot drift.
 * Order is the Studio's (Apple's own); the phone keeps its display order by id.
 */
export const APPLE_CATEGORIES = [
  { id: 1301, name: 'Arts' },
  { id: 1321, name: 'Business' },
  { id: 1303, name: 'Comedy' },
  { id: 1304, name: 'Education' },
  { id: 1483, name: 'Fiction' },
  { id: 1511, name: 'Government' },
  { id: 1487, name: 'History' },
  { id: 1512, name: 'Health & Fitness' },
  { id: 1305, name: 'Kids & Family' },
  { id: 1502, name: 'Leisure' },
  { id: 1310, name: 'Music' },
  { id: 1489, name: 'News' },
  { id: 1314, name: 'Religion & Spirituality' },
  { id: 1533, name: 'Science' },
  { id: 1324, name: 'Society & Culture' },
  { id: 1545, name: 'Sports' },
  { id: 1318, name: 'Technology' },
  { id: 1488, name: 'True Crime' },
  { id: 1309, name: 'TV & Film' },
] as const;

export type AppleCategoryName = (typeof APPLE_CATEGORIES)[number]['name'];

/** The names, in order — what a `z.enum` or a `<select>` wants. */
export const CATEGORY_NAMES = APPLE_CATEGORIES.map((c) => c.name) as unknown as readonly [AppleCategoryName, ...AppleCategoryName[]];

/** The display name for an Apple genre id; undefined when it is not a top-level one. */
export function categoryName(id: number): string | undefined {
  return APPLE_CATEGORIES.find((c) => c.id === id)?.name;
}

/** Apple's genre id for a category name (any case, spaces trimmed, `&amp;` accepted); undefined when unknown. */
export function categoryId(name: string): number | undefined {
  const key = name.trim().toLowerCase().replace(/\s*&amp;\s*/g, ' & ');
  return APPLE_CATEGORIES.find((c) => c.name.toLowerCase() === key)?.id;
}
