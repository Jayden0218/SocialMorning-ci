/**
 * Apple's top-level podcast genres (the ids the `toppodcasts/genre=` chart accepts),
 * matched by name to a feed's `<itunes:category>` (M5 research R5). Unknown → undefined
 * → the all-genres chart.
 */
export const APPLE_GENRES: Record<string, number> = {
  'arts': 1301, 'business': 1321, 'comedy': 1303, 'education': 1304, 'fiction': 1483, 'government': 1511, 'history': 1487,
  'health & fitness': 1512, 'kids & family': 1305, 'leisure': 1502, 'music': 1310, 'news': 1489, 'religion & spirituality': 1314,
  'science': 1533, 'society & culture': 1324, 'sports': 1545, 'technology': 1318, 'true crime': 1488, 'tv & film': 1309,
};

export function genreIdFor(categories: readonly string[]): { id: number; name: string } | undefined {
  for (const c of categories) {
    const key = c.trim().toLowerCase().replace(/\s*&amp;\s*/g, ' & ');
    const id = APPLE_GENRES[key];
    if (id !== undefined) return { id, name: c.trim() };
  }
  return undefined;
}

/**
 * M10: the display name for a genre id ("Health & Fitness", "TV & Film"), from the keys
 * above so the two cannot drift. Undefined for an id that is not an Apple top-level genre.
 */
export function genreName(id: number): string | undefined {
  const key = Object.keys(APPLE_GENRES).find((k) => APPLE_GENRES[k] === id);
  if (key === undefined) return undefined;
  return key.split(' ').map((w) => (w === 'tv' ? 'TV' : w === '&' ? w : w[0]!.toUpperCase() + w.slice(1))).join(' ');
}

/** M10: every top-level genre with its display name, in name order. */
export const GENRE_LIST: readonly { genreId: number; name: string }[] = Object.values(APPLE_GENRES)
  .map((id) => ({ genreId: id, name: genreName(id)! }))
  .sort((a, b) => a.name.localeCompare(b.name));
