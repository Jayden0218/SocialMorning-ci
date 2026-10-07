// Tests when the first-open interests page is shown, and how picks and skips are remembered.
/** M22 US5 (FR-017). */
import { ASK_AGAIN_MS, interestsDue, interestsDueFrom, pickedInterests, savePicked, saveSkip, toggleGenre } from '@/discover/interests';

const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); } };
};

it('a first open with nothing saved asks; two picks never ask again', () => {
  expect(interestsDue({ picked: [], askedAgain: false, now: 0 })).toBe(true);
  expect(interestsDue({ picked: [1303], askedAgain: false, now: 0 })).toBe(true);
  expect(interestsDue({ picked: [1303, 1487], askedAgain: false, now: 0 })).toBe(false);
});

it('a skip is asked again once, a week later, and never after a second skip', () => {
  const s = memory();
  saveSkip(s, 1_000);
  expect(interestsDueFrom(s, 1_000 + ASK_AGAIN_MS - 1)).toBe(false);
  expect(interestsDueFrom(s, 1_000 + ASK_AGAIN_MS)).toBe(true);
  saveSkip(s, 2_000 + ASK_AGAIN_MS);
  expect(interestsDueFrom(s, 10 * ASK_AGAIN_MS)).toBe(false);
});

it('picks are saved and read back; a broken value reads as none', () => {
  const s = memory();
  savePicked(s, [1303, 1487]);
  expect(pickedInterests(s)).toEqual([1303, 1487]);
  expect(interestsDueFrom(s, 0)).toBe(false);
  s.set('interests.genreIds', '{oops');
  expect(pickedInterests(s)).toEqual([]);
});

it('tapping a tile adds or removes it', () => {
  expect(toggleGenre([], 1303)).toEqual([1303]);
  expect(toggleGenre([1303, 1487], 1303)).toEqual([1487]);
});
