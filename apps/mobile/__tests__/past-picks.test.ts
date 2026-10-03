// Tests that past-picks dates are not shifted by time zone, and Recent shows 10.
/**
 * M12 FR-070 / FR-073 helpers: a past-picks day title keeps the date as written (never
 * shifted by the phone's zone), and search's "Recent" is the newest 10.
 * The breaks: build `dayTitle` from local-time getters; drop the slice in `recentSearches`.
 */
import { dayTitle } from '@/discover/sections';
import { RECENT_MAX, recentSearches } from '@/search/history';

it('a day title is the date as written', () => {
  expect(dayTitle('2026-09-22')).toBe('Tue 22 Sep 2026');
  expect(dayTitle('2026-01-01')).toBe('Thu 1 Jan 2026');
  expect(dayTitle('not a date')).toBe('not a date');
});

it('Recent lists the newest 10, newest first', () => {
  const history = Array.from({ length: 14 }, (_, i) => `term ${i}`);
  expect(RECENT_MAX).toBe(10);
  expect(recentSearches(history)).toEqual(history.slice(0, 10));
  expect(recentSearches(['a'])).toEqual(['a']);
});
