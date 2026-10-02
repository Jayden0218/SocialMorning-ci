/**
 * M16a guard G-B3 (FR-005). Phone walk 2026-10-02: the profile card said 4 stickers and 13 h
 * listened; the Stickers page said "1 of 8 earned" and "First hour 0 of 1 h". The profile used
 * the larger of the server's and this phone's listening (M12 FR-006); the Stickers page used the
 * server's alone, from 0. Both screens now read src/me/my-stickers.ts.
 *
 * The break that turns it red: read the old source on one screen — e.g. put back
 * `stickers({ listenedMs: p.stats?.all.listenedMs ?? 0, … })` in app/stickers.tsx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { myStickers, myTotals } from '../src/me/my-stickers';

const H = 3_600_000;
/** This phone: 13 h on one episode (finished) — the walk's numbers. */
const stores = {
  positions: { all: () => [{ episodeId: 'e1', offsetMs: 0, finished: true }] },
  feeds: { getEpisode: (id: string) => (id === 'e1' ? { id, durationMs: 13 * H } : undefined) },
  settings: { get: () => undefined, set: () => undefined },
} as never;
const profile = (listenedMs: number) => ({ stats: { last7: { listenedMs: 0, finished: 0, topShows: [] }, all: { listenedMs, finished: 0, topShows: [] } }, recent: [] }) as never;
const earned = (list: { id: string; earned: boolean }[]) => list.filter((s) => s.earned).map((s) => s.id);

it('your totals are the larger of the server\'s and this phone\'s', () => {
  expect(myTotals(stores, undefined)).toEqual({ listenedMs: 13 * H, finished: 1 });
  expect(myTotals(stores, { listenedMs: 0, finished: 0 })).toEqual({ listenedMs: 13 * H, finished: 1 });
  expect(myTotals(stores, { listenedMs: 50 * H, finished: 0 })).toEqual({ listenedMs: 50 * H, finished: 1 });
});

it('"First hour" is earned when the profile shows ≥ 1 h — before and after the server answers', () => {
  expect(earned(myStickers(stores, undefined))).toEqual(expect.arrayContaining(['hour-1', 'hour-10', 'finish-1']));
  expect(earned(myStickers(stores, profile(0)))).toEqual(expect.arrayContaining(['hour-1', 'hour-10', 'finish-1']));
});

it('both screens read the one source, and neither builds stickers from its own numbers', () => {
  for (const page of ['app/stickers.tsx', 'app/profile/[id].tsx']) {
    const src = readFileSync(join(__dirname, '..', page), 'utf8');
    expect([page, /\bmyStickers\(/.test(src)]).toEqual([page, true]);
    expect([page, /\bstickers\(\{/.test(src)]).toEqual([page, false]);
  }
});
