/**
 * Apple's top-level podcast genres (the ids `toppodcasts/genre=` accepts; the server's
 * `catalog/genres.ts` has the same ids). Kept on the phone so the category strip draws
 * without a network call. The emoji is the tile's picture — no icon font in the app.
 */
export type Genre = { id: number; name: string; emoji: string };

export const GENRES: readonly Genre[] = [
  { id: 1321, name: 'Business', emoji: '💼' },
  { id: 1324, name: 'Society & Culture', emoji: '🏛️' },
  { id: 1304, name: 'Education', emoji: '🎓' },
  { id: 1303, name: 'Comedy', emoji: '😂' },
  { id: 1489, name: 'News', emoji: '📰' },
  { id: 1318, name: 'Technology', emoji: '💻' },
  { id: 1533, name: 'Science', emoji: '🔬' },
  { id: 1512, name: 'Health & Fitness', emoji: '🏃' },
  { id: 1487, name: 'History', emoji: '📜' },
  { id: 1301, name: 'Arts', emoji: '🎨' },
  { id: 1488, name: 'True Crime', emoji: '🔎' },
  { id: 1483, name: 'Fiction', emoji: '📖' },
  { id: 1309, name: 'TV & Film', emoji: '🎬' },
  { id: 1310, name: 'Music', emoji: '🎵' },
  { id: 1545, name: 'Sports', emoji: '⚽' },
  { id: 1502, name: 'Leisure', emoji: '🎮' },
  { id: 1305, name: 'Kids & Family', emoji: '🧸' },
  { id: 1314, name: 'Religion & Spirituality', emoji: '🕊️' },
  { id: 1511, name: 'Government', emoji: '🏢' },
];

export const genreById = (id: number): Genre | undefined => GENRES.find((g) => g.id === id);
