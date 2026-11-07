// Tests the sums behind the ring and the heat bars: angles, spokes, colour steps, resampling.
/**
 * M31 T022 guard G-K1: the ring starts at 12 o'clock and runs clockwise, there are 100 spokes, and a
 * touch at an angle seeks that fraction. The break that turns it red: start the angle at 3 o'clock
 * (drop the `- Math.PI / 2` in `angleOf`) — `fractionAt` and the knob both move a quarter turn.
 */
import { BUCKETS, angleOf, badgeText, fractionAt, mixColour, playedColour, playedCount, pointOn, sample, spokes } from '@/ui/kit/pulse-math';
import { colour } from '@/design';

it('0 is 12 o\'clock, a quarter is 3 o\'clock, half is 6, three quarters is 9', () => {
  const at = (f: number) => pointOn(100, 40, f);
  expect(at(0).x).toBeCloseTo(50, 5); expect(at(0).y).toBeCloseTo(10, 5);
  expect(at(0.25).x).toBeCloseTo(90, 5); expect(at(0.25).y).toBeCloseTo(50, 5);
  expect(at(0.5).x).toBeCloseTo(50, 5); expect(at(0.5).y).toBeCloseTo(90, 5);
  expect(at(0.75).x).toBeCloseTo(10, 5); expect(at(0.75).y).toBeCloseTo(50, 5);
  expect(angleOf(0)).toBeCloseTo(-Math.PI / 2, 8);
});

it('a touch maps back to the fraction round the ring, clockwise from the top', () => {
  expect(fractionAt(50, 10, 50, 50)).toBeCloseTo(0, 5); // straight up
  expect(fractionAt(90, 50, 50, 50)).toBeCloseTo(0.25, 5); // right
  expect(fractionAt(50, 90, 50, 50)).toBeCloseTo(0.5, 5); // down
  expect(fractionAt(10, 50, 50, 50)).toBeCloseTo(0.75, 5); // left
  expect(fractionAt(40, 10, 50, 50)).toBeGreaterThan(0.9); // just left of the top is the end of the loop
});

it('100 spokes start outside the cover and the hotter the bucket the longer the spoke', () => {
  const heat = Array.from({ length: BUCKETS }, (_, k) => (k === 30 ? 1 : 0));
  const { spokes: s, r0 } = spokes(330, 0.62, heat);
  expect(s).toHaveLength(100);
  expect(r0).toBeCloseTo((330 * 0.62) / 2 + 10, 8);
  const len = (i: number) => Math.hypot(s[i]!.x2 - s[i]!.x1, s[i]!.y2 - s[i]!.y1);
  expect(len(30)).toBeGreaterThan(len(29));
  expect(len(29)).toBeCloseTo(4, 5); // a cold bucket is 4 long
  expect(len(30)).toBeCloseTo(4 + (330 / 2 - r0 - 6), 5); // the hottest reaches the rim margin
  expect(Math.hypot(s[0]!.x1 - 165, s[0]!.y1 - 165)).toBeCloseTo(r0, 5);
});

it('the played colour runs hot to violet across what is played', () => {
  expect(playedColour(0, 10)).toBe('rgb(255, 77, 109)'); // hot
  expect(playedColour(10, 10)).toBe('rgb(122, 60, 255)'); // violet
  expect(playedColour(5, 10)).toBe(mixColour(colour.hot, colour.violet, 0.5));
  expect(playedColour(0, 10, '#2dd4bf')).toBe('rgb(45, 212, 191)'); // an accent replaces hot
});

it('sample takes every nth bucket (kit.js pick), plays a fraction of n, and badges say 99+', () => {
  const data = Array.from({ length: 100 }, (_, k) => k / 100);
  expect(sample(data, 50)).toHaveLength(50);
  expect(sample(data, 50)[1]).toBe(0.02);
  expect(sample([], 5)).toEqual([0, 0, 0, 0, 0]);
  expect(sample([2, -1], 2)).toEqual([1, 0]); // clamped to 0–1
  expect(playedCount(0.26, 50)).toBe(13);
  expect(playedCount(7, 50)).toBe(50);
  expect(badgeText(3)).toBe('3');
  expect(badgeText(99)).toBe('99');
  expect(badgeText(100)).toBe('99+');
});
