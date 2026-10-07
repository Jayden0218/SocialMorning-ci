// Tests picking transcript lines as one unbroken run, and when the run can become a clip.
/** M22 US9 (FR-028, FR-029). */
import { clipCheck, extendRange, rangeLines } from '@/graph/transcript-select';
import { quoteOf } from '@/graph/quote';
import { openComposer } from '@/graph/composer';

const lines = [
  { startMs: 0, endMs: 4_000, text: 'One.' },
  { startMs: 4_000, endMs: 9_000, text: 'Two.' },
  { startMs: 9_000, endMs: 15_000, text: 'Three.' },
  { startMs: 15_000, text: 'Four.' },
  { startMs: 700_000, endMs: 701_000, text: 'Much later.' },
];

describe('extendRange', () => {
  it('a long-press starts at one line; taps grow the run without gaps', () => {
    let r = extendRange(undefined, 1);
    expect(r).toEqual([1, 1]);
    r = extendRange(r, 3);
    expect(rangeLines(r)).toEqual([1, 2, 3]);
    r = extendRange(r, 0);
    expect(rangeLines(r)).toEqual([0, 1, 2, 3]);
  });

  it('a tap on an end drops it, a tap inside shrinks to there, the last line tapped clears', () => {
    expect(extendRange([0, 3], 0)).toEqual([1, 3]);
    expect(extendRange([0, 3], 3)).toEqual([0, 2]);
    expect(extendRange([0, 3], 1)).toEqual([0, 1]);
    expect(extendRange([2, 2], 2)).toBeUndefined();
    expect(rangeLines(undefined)).toEqual([]);
  });
});

describe('clipCheck', () => {
  it('three lines make a clip from line 1 start to line 3 end', () => {
    const q = quoteOf(lines, rangeLines([0, 2]), true);
    expect(clipCheck(q)).toEqual({ ok: true, startMs: 0, endMs: 15_000 });
  });

  it('a line with no end of its own ends at the next line', () => {
    const q = quoteOf(lines, rangeLines([2, 3]), true);
    expect(clipCheck(q)).toEqual({ ok: true, startMs: 9_000, endMs: 700_000 });
  });

  it('over 10 minutes, or a transcript with no times, is refused with the reason', () => {
    const long = clipCheck(quoteOf(lines, rangeLines([0, 4]), true));
    expect(long.ok).toBe(false);
    expect(long.ok ? '' : long.reason).toMatch(/at most 10 minutes/);
    const untimed = clipCheck(quoteOf([{ startMs: 0, text: 'para' }], [0], false));
    expect(untimed.ok ? '' : untimed.reason).toMatch(/no times/);
    expect(clipCheck(undefined).ok).toBe(false);
  });

  it('the composer opens on the picked range with the lines as the caption', () => {
    const s = openComposer('ep', 0, 3_600_000, { range: { startMs: 0, endMs: 15_000 }, caption: 'One. Two. Three.' });
    expect(s.range).toEqual({ startMs: 0, endMs: 15_000 });
    expect(s.caption).toBe('One. Two. Three.');
    expect(s.problem).toBeUndefined();
    expect(openComposer('ep', 0, undefined, { range: { startMs: 0, endMs: 700_000 } }).problem).toBe('too_long');
  });
});
