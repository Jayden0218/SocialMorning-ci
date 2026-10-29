// R2 (verify-report rows 2 and 4): a short date is the LOCAL "27 Oct" / "12 Mar 2025", never the ISO UTC day "2026-10-27".
/**
 * Written BEFORE the fix: red today. Drawings: design-pulse2 Updates card chip "27 OCT · 48 MIN", Me lists "27 Oct".
 * `shortDate` (src/ui/kit/format.ts) today prints `toISOString().slice(0, 10)`. Its callers: `ago` (> 7 days), `coverChip` (Updates card),
 * `ageLabel` (src/ui/me/lists.tsx), app/redeem.tsx, app/settings/feedback.tsx, src/ui/tips/parts.tsx (those three call `shortDate` directly,
 * so the unit tests below cover them). The current year is left out; another year is written ("12 Mar 2025").
 * Tests that PIN THE OLD ISO text and that phase 2 must update: __tests__/format.test.ts:24 (`shortDate(Date.UTC(2024, 8, 10))` toBe '2024-09-10').
 * (m31-f9-showinfo-dates.test.tsx is about `ownerRows`, not `shortDate`, and does not pin ISO.)
 * TZ-independent: jest gives a test a COPY of process.env, so setting TZ in a test does not move the clock. Each case instead makes `Date`'s local
 * getters (getDate / getMonth / getFullYear) answer for a zone through Intl, so the same instant is a different local day in each zone.
 */
import { ago, shortDate } from '@/ui/kit/format';
import { coverChip } from '@/ui/episode/UpdateEpisodeRow';
import { ageLabel } from '@/ui/me/lists';

const NOW = Date.UTC(2026, 9, 28, 12, 0); // 28 Oct 2026, the year of "today"
/** Make this process's local calendar the one of `zone` (restored by afterEach). */
function inZone(zone: string): void {
  const parts = (d: Date): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const p of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
    return o;
  };
  jest.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) { return parts(this)['day']!; });
  jest.spyOn(Date.prototype, 'getMonth').mockImplementation(function (this: Date) { return parts(this)['month']! - 1; });
  jest.spyOn(Date.prototype, 'getFullYear').mockImplementation(function (this: Date) { return parts(this)['year']!; });
}
beforeEach(() => { jest.useFakeTimers({ now: NOW }); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

// [zone, instant, expected local label]. 23:30 UTC on 20 Oct: Auckland (UTC+13 in October) is already 21 Oct; Honolulu (UTC-10) is still 20 Oct.
const CASES: [string, number, string][] = [
  ['Pacific/Auckland', Date.UTC(2026, 9, 20, 23, 30), '21 Oct'],
  ['Pacific/Honolulu', Date.UTC(2026, 9, 21, 3, 0), '20 Oct'], // 03:00 UTC on the 21st is 17:00 on the 20th
  ['UTC', Date.UTC(2026, 9, 20, 23, 30), '20 Oct'],
];

describe.each(CASES)('R2-1 shortDate in %s', (zone, at, label) => {
  beforeEach(() => { inZone(zone); });
  it(`prints the local day-month "${label}", not the ISO day`, () => {
    expect(shortDate(at)).toBe(label);
    expect(shortDate(at)).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('ago() after a week prints the same short local date', () => {
    expect(ago(at, NOW)).toBe(label);
  });
  it('the Updates card chip writes the local date before the length', () => {
    expect(coverChip(at, 48 * 60_000, NOW).toLowerCase()).toBe(`${label.toLowerCase()} · 48 min`);
  });
  it('a Me list row older than a week (ageLabel) writes it too', () => {
    expect(ageLabel(at, NOW)).toBe(label);
  });
});

describe('R2-2 the year', () => {
  it('another year is written ("12 Mar 2025"); this year is not', () => {
    inZone('UTC');
    expect(shortDate(Date.UTC(2025, 2, 12, 10, 0))).toBe('12 Mar 2025');
    expect(shortDate(Date.UTC(2026, 2, 12, 10, 0))).toBe('12 Mar');
  });
  it('the year follows the LOCAL day: 31 Dec 23:30 UTC is already 1 Jan of the next year in Auckland', () => {
    inZone('Pacific/Auckland');
    expect(shortDate(Date.UTC(2025, 11, 31, 23, 30))).toBe('1 Jan');
  });
  it('nothing in, nothing out', () => {
    expect(shortDate(undefined)).toBe('');
    expect(shortDate(Number.NaN)).toBe('');
  });
});
