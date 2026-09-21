/**
 * FR-019 and FR-020, the whole table. These decide whether someone is
 * offered an episode at 1:59:41 or told they have finished it, which is a
 * visible, arguable product decision rather than an implementation detail.
 */
import { isFinished, reconcileOffset } from '../src/playback/finished';
import { FINISHED_WITHIN_MS } from '../src/playback/types';

const HOUR = 3_600_000;

describe('isFinished (FR-019)', () => {
  it('is true when playback reached the end, whatever the numbers say', () => {
    expect(isFinished(0, HOUR, true)).toBe(true);
    expect(isFinished(0, undefined, true)).toBe(true);
  });

  it('is true when stopped within the last 30 seconds', () => {
    expect(isFinished(HOUR - 29_000, HOUR, false)).toBe(true);
  });

  // The boundary is the whole requirement. 30 000 exactly is INSIDE.
  it('is true at exactly 30 000 ms remaining and false at 30 001', () => {
    expect(isFinished(HOUR - FINISHED_WITHIN_MS, HOUR, false)).toBe(true);
    expect(isFinished(HOUR - FINISHED_WITHIN_MS - 1, HOUR, false)).toBe(false);
  });

  it('is false when stopped 31 seconds out', () => {
    expect(isFinished(HOUR - 31_000, HOUR, false)).toBe(false);
  });

  // `<itunes:duration>` is the least trustworthy field in podcast RSS and is
  // often simply absent. Guessing from a duration we do not have would mark
  // episodes finished at random.
  it('is false with no duration unless the end was actually reached', () => {
    expect(isFinished(5_000_000, undefined, false)).toBe(false);
    expect(isFinished(5_000_000, undefined, true)).toBe(true);
  });

  it('is true past the declared end', () => {
    expect(isFinished(HOUR + 60_000, HOUR, false)).toBe(true);
  });
});

describe('reconcileOffset (FR-020)', () => {
  // The publisher replaced the file with a shorter one. Seeking to a position
  // that no longer exists is the failure this prevents.
  it('a stored 4 000 000 against a 3 000 000 duration is finished and clamped', () => {
    expect(reconcileOffset(4_000_000, 3_000_000)).toEqual({
      offsetMs: 3_000_000,
      finished: true,
    });
  });

  it('a stored 2 000 000 against a 1 500 000 duration clamps to 1 500 000 and is finished', () => {
    // 2 000 000 >= 1 500 000 - 30 000, so they had effectively finished it.
    expect(reconcileOffset(2_000_000, 1_500_000)).toEqual({
      offsetMs: 1_500_000,
      finished: true,
    });
  });

  it('a position inside the file is returned untouched and unfinished', () => {
    expect(reconcileOffset(872_000, HOUR)).toEqual({ offsetMs: 872_000, finished: false });
  });

  it('a position inside the file but in its last 30 seconds is finished, not clamped', () => {
    expect(reconcileOffset(HOUR - 10_000, HOUR)).toEqual({
      offsetMs: HOUR - 10_000,
      finished: true,
    });
  });

  it('with no known duration it neither clamps nor invents a verdict', () => {
    expect(reconcileOffset(872_000, undefined)).toEqual({ offsetMs: 872_000, finished: false });
  });

  it('a position exactly at the duration is not clamped', () => {
    expect(reconcileOffset(HOUR, HOUR)).toEqual({ offsetMs: HOUR, finished: true });
  });
});
