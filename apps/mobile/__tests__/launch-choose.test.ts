// Tests when a launch promotion is shown, and that it is picked by weight.
/**
 * Guard G-L1 (specs/015-m15-admin/data-model.md): `chooseLaunch` shows nothing when the
 * image is not cached, in minor mode, signed out, with the Terms due, outside the dates,
 * or past the daily cap — and otherwise picks by weight. `src/launch/choose.ts` is held to
 * 100 % branches by jest.config.js (`coverageThreshold`).
 *
 * The break that turns it red: drop `input.cachedIds.has(p.id) &&` from the filter in
 * `chooseLaunch` (src/launch/choose.ts) — "not cached → none" fails.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  LAUNCH_MAX_MS, LAUNCH_ROUTES, chooseLaunch, isLive, knownRoute, localDay, markShown, resolveTarget, shownToday,
  type ChooseInput, type Promotion,
} from '@/launch/choose';

/** mulberry32 — a seeded [0, 1) so the weighted pick is repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date(2026, 9, 1, 9, 0, 0).getTime(); // 1 Oct 2026, 09:00 local
const TODAY = localDay(NOW);
const promo = (id: string, over: Partial<Promotion> = {}): Promotion => ({
  id, imageUrl: `https://blob.example/launch/${id}.png`, targetKind: 'route', target: '/chart', label: 'Promotion',
  startsAt: new Date(NOW - 3_600_000).toISOString(), endsAt: new Date(NOW + 3_600_000).toISOString(), weight: 1, dailyCap: 1, ...over,
});
const base = (over: Partial<ChooseInput> = {}): ChooseInput => ({
  list: [promo('a')], cachedIds: new Set(['a']), now: NOW, shown: undefined,
  minor: false, signedIn: true, termsDue: false, random: seeded(1), ...over,
});

it('shows a live, cached promotion to a signed-in adult with the Terms accepted', () => {
  expect(chooseLaunch(base())?.id).toBe('a');
  expect(LAUNCH_MAX_MS).toBeLessThanOrEqual(3_000);
});

describe('none', () => {
  it('when the image is not cached (FR-015)', () => { expect(chooseLaunch(base({ cachedIds: new Set() }))).toBeUndefined(); });
  it('in minor mode', () => { expect(chooseLaunch(base({ minor: true }))).toBeUndefined(); });
  it('signed out', () => { expect(chooseLaunch(base({ signedIn: false }))).toBeUndefined(); });
  it('with the Terms due', () => { expect(chooseLaunch(base({ termsDue: true }))).toBeUndefined(); });
  it('before its start', () => { expect(chooseLaunch(base({ list: [promo('a', { startsAt: new Date(NOW + 1).toISOString() })] }))).toBeUndefined(); });
  it('at or after its end (FR-016), even with the image on the phone', () => {
    expect(chooseLaunch(base({ list: [promo('a', { endsAt: new Date(NOW).toISOString() })] }))).toBeUndefined();
  });
  it('with an unreadable date', () => { expect(chooseLaunch(base({ list: [promo('a', { endsAt: 'soon' })] }))).toBeUndefined(); });
  it('with weight 0', () => { expect(chooseLaunch(base({ list: [promo('a', { weight: 0 })] }))).toBeUndefined(); });
  it('when today\'s cap is reached', () => {
    expect(chooseLaunch(base({ shown: { day: TODAY, counts: { a: 1 } } }))).toBeUndefined();
  });
  it('with an empty list', () => { expect(chooseLaunch(base({ list: [] }))).toBeUndefined(); });
});

it('the cap is per local day: yesterday\'s count does not count today', () => {
  expect(chooseLaunch(base({ shown: { day: '2026-09-30', counts: { a: 5 } } }))?.id).toBe('a');
  expect(chooseLaunch(base({ shown: { day: TODAY, counts: { b: 3 } }, list: [promo('a', { dailyCap: 2 })] }))?.id).toBe('a');
  expect(chooseLaunch(base({ shown: { day: TODAY, counts: { a: 1 } }, list: [promo('a', { dailyCap: 2 })] }))?.id).toBe('a');
});

it('picks by weight (seeded): 3 : 1 comes out near 75 %', () => {
  const random = seeded(42);
  const input = base({ list: [promo('a', { weight: 3 }), promo('b', { weight: 1 })], cachedIds: new Set(['a', 'b']), random });
  const n = 4_000;
  let a = 0;
  for (let i = 0; i < n; i++) if (chooseLaunch(input)?.id === 'a') a++;
  expect(a / n).toBeGreaterThan(0.72);
  expect(a / n).toBeLessThan(0.78);
});

it('only eligible ones take part, and random() at the edges stays inside the list', () => {
  const list = [promo('a'), promo('b'), promo('c')];
  const cachedIds = new Set(['b', 'c']);
  expect(chooseLaunch(base({ list, cachedIds, random: () => 0 }))?.id).toBe('b');
  expect(chooseLaunch(base({ list, cachedIds, random: () => 0.99 }))?.id).toBe('c');
  // A random() of exactly 1 (outside its contract) still returns the last, not none.
  expect(chooseLaunch(base({ list, cachedIds, random: () => 1 }))?.id).toBe('c');
});

it('helpers: localDay, shownToday, markShown, isLive', () => {
  expect(localDay(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  expect(shownToday(undefined, 'a', TODAY)).toBe(0);
  expect(shownToday({ day: 'old', counts: { a: 2 } }, 'a', TODAY)).toBe(0);
  expect(shownToday({ day: TODAY, counts: { a: 2 } }, 'a', TODAY)).toBe(2);
  expect(shownToday({ day: TODAY, counts: {} }, 'a', TODAY)).toBe(0);
  expect(markShown(undefined, 'a', TODAY)).toEqual({ day: TODAY, counts: { a: 1 } });
  expect(markShown({ day: TODAY, counts: { a: 1, b: 1 } }, 'a', TODAY)).toEqual({ day: TODAY, counts: { a: 2, b: 1 } });
  expect(markShown({ day: 'old', counts: { a: 4 } }, 'a', TODAY)).toEqual({ day: TODAY, counts: { a: 1 } });
  expect(isLive(promo('a'), NOW)).toBe(true);
});

it('a tap: https opens outside; a known page opens; anything else opens Discover', () => {
  const known = (p: string) => p === '/chart';
  expect(resolveTarget({ targetKind: 'url', target: 'https://example.com/x' }, known)).toEqual({ kind: 'url', url: 'https://example.com/x' });
  expect(resolveTarget({ targetKind: 'url', target: 'http://example.com/x' }, known)).toEqual({ kind: 'route', path: '/' });
  expect(resolveTarget({ targetKind: 'route', target: '/chart' }, known)).toEqual({ kind: 'route', path: '/chart' });
  expect(resolveTarget({ targetKind: 'route', target: '/gone' }, known)).toEqual({ kind: 'route', path: '/' });
});

it('knownRoute matches the page list, with one segment per [param], query ignored', () => {
  expect(knownRoute('/chart')).toBe(true);
  expect(knownRoute('/')).toBe(true);
  expect(knownRoute('/show/https%3A%2F%2Ff.example%2Fx.xml')).toBe(true);
  expect(knownRoute('/category/1303?x=1')).toBe(true);
  expect(knownRoute('/show')).toBe(false);
  expect(knownRoute('/no-such-page')).toBe(false);
  expect(knownRoute('chart')).toBe(false);
  expect(knownRoute('/a/b', ['/a/[x]', '/a'])).toBe(true);
  expect(knownRoute('/a/b/c', ['/a/[x]'])).toBe(false);
});

it('every launch route still has a page under app/ (a renamed page would send taps to Discover)', () => {
  const APP = join(__dirname, '..', 'app');
  const exists = (route: string): boolean => {
    if (route === '/') return existsSync(join(APP, '(tabs)', 'index.tsx'));
    const rel = route.slice(1);
    return [join(APP, `${rel}.tsx`), join(APP, rel, 'index.tsx'), join(APP, '(tabs)', `${rel}.tsx`)].some(existsSync);
  };
  expect(LAUNCH_ROUTES.filter((r) => !exists(r))).toEqual([]);
});
