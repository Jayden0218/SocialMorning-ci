// Tests that similar shows come from the same genre, excluding itself and hidden shows.
/**
 * M12 guard G-SH1 (FR-063): About's similar shows come from the show's genre chart — never
 * the show itself, never a hidden show, at most 6. The break: drop the self filter.
 */
import { genreOf, similarShows } from '@/discover/genres';

it('a feed category names its genre, case and &amp; aside', () => {
  expect(genreOf(['Technology'])?.id).toBe(1318);
  expect(genreOf(['society &amp; culture'])?.id).toBe(1324);
  expect(genreOf(['Podcasts', 'Comedy'])?.id).toBe(1303);
  expect(genreOf(['Nothing like it'])).toBeUndefined();
  expect(genreOf(undefined)).toBeUndefined();
});

it('similar shows leave out this show and hidden ones, 6 at most', () => {
  const shows = Array.from({ length: 10 }, (_, i) => ({ feedUrl: `f${i}` }));
  const r = similarShows(shows, 'f0', new Set(['f2']));
  expect(r.map((s) => s.feedUrl)).toEqual(['f1', 'f3', 'f4', 'f5', 'f6', 'f7']);
});
