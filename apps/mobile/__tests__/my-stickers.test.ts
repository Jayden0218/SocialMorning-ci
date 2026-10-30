// Tests that the profile and Stickers page use the same listening totals.
/**
 * M16a guard G-B3 (FR-005). Phone walk 2026-10-02: the profile card said 4 stickers and 13 h
 * listened; the Stickers page said "1 of 8 earned" and "First hour 0 of 1 h". The profile used
 * the larger of the server's and this phone's listening (M12 FR-006); the Stickers page used the
 * server's alone, from 0. Both screens now read src/me/my-stickers.ts.
 *
 * The Stickers page is rendered (app/stickers.tsx): with 13 h on this phone and a server that
 * says 0 h, "First hour" is earned before AND after the server answers. The profile page keeps a
 * source check: it needs about 20 hooks and APIs (profile, likes, playlists, comment extras,
 * safety, report sheet, card actions) to draw its sticker row.
 *
 * The break that turns it red: read the old source on one screen — e.g. put back
 * `stickers({ listenedMs: p.stats?.all.listenedMs ?? 0, … })` in app/stickers.tsx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { myStickers, myTotals } from '@/me/my-stickers';

const H = 3_600_000;
/** This phone: 13 h on one episode (finished) — the walk's numbers. */
const mockStores = {
  positions: { all: () => [{ episodeId: 'e1', offsetMs: 0, finished: true }] },
  feeds: { getEpisode: (id: string) => (id === 'e1' ? { id, durationMs: 13 * H } : undefined) },
  settings: { get: () => undefined, set: () => undefined },
};
const stores = mockStores as never;
const profile = (listenedMs: number) => ({ stats: { last7: { listenedMs: 0, finished: 0, topShows: [] }, all: { listenedMs, finished: 0, topShows: [] } }, recent: [] }) as never;
const earned = (list: { id: string; earned: boolean }[]) => list.filter((s) => s.earned).map((s) => s.id);

// One object per hook, as the real contexts give: a new one per render would re-run the page's load effect.
const mockApi = { profile: jest.fn() };
const mockSocial = { api: mockApi, listener: { listenerId: 'me' } };
const mockListening = { listening: () => Promise.resolve({ earned: {} }) };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => mockListening }));
// The bar and the closed sticker card are not what this guard is about.
jest.mock('@/ui/kit/PageHeader', () => ({ PageHeader: () => null }));
jest.mock('@/ui/lib/actionsheet', () => ({
  Actionsheet: () => null, ActionsheetBackdrop: () => null, ActionsheetContent: () => null,
  ActionsheetDragIndicator: () => null, ActionsheetDragIndicatorWrapper: () => null,
}));

import StickersScreen from '../app/stickers';

it('your totals are the larger of the server\'s and this phone\'s', () => {
  expect(myTotals(stores, undefined)).toEqual({ listenedMs: 13 * H, finished: 1 });
  expect(myTotals(stores, { listenedMs: 0, finished: 0 })).toEqual({ listenedMs: 13 * H, finished: 1 });
  expect(myTotals(stores, { listenedMs: 50 * H, finished: 0 })).toEqual({ listenedMs: 50 * H, finished: 1 });
});

it('"First hour" is earned when the profile shows ≥ 1 h — before and after the server answers', () => {
  expect(earned(myStickers(stores, undefined))).toEqual(expect.arrayContaining(['hour-1', 'hour-10', 'finish-1']));
  expect(earned(myStickers(stores, profile(0)))).toEqual(expect.arrayContaining(['hour-1', 'hour-10', 'finish-1']));
});

describe('the Stickers page shows what the profile shows', () => {
  /** Earned cards are labelled "<title>. Earned…. Open its card"; the rest "<title>. <progress>". */
  const cards = (r: ReactTestRenderer) => {
    const all = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
    return { earned: all.filter((l) => l.endsWith('. Open its card')), next: all.filter((l) => /\. \d+ of /.test(l)) };
  };

  it('13 h on this phone, 0 h on the server: First hour, 10 hours and First episode finished are earned, before and after the answer', async () => {
    let answer!: (p: unknown) => void;
    mockApi.profile.mockReset().mockReturnValue(new Promise((res) => { answer = res; }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(StickersScreen)); });

    // Before the server answers: this phone's totals, not 0.
    const before = cards(r);
    for (const title of ['First hour', '10 hours listened', 'First episode finished']) {
      expect([title, before.earned.some((l) => l.startsWith(`${title}. `))]).toEqual([title, true]);
    }
    expect(before.next.filter((l) => l.startsWith('First hour. '))).toEqual([]);

    // The server says 0 h: the page keeps the larger, so nothing it showed is taken back.
    await act(async () => { answer(profile(0)); });
    expect(mockApi.profile).toHaveBeenCalledWith('me');
    const after = cards(r);
    for (const title of ['First hour', '10 hours listened', 'First episode finished']) {
      expect([title, after.earned.some((l) => l.startsWith(`${title}. `))]).toEqual([title, true]);
    }
    expect(after.next.filter((l) => l.startsWith('First hour. ') || l.startsWith('10 hours listened. '))).toEqual([]);
    // Something is still to come (42 h, 100 h…), so the "Next up" finder is not blind.
    expect(after.next.length).toBeGreaterThan(0);
    act(() => r.unmount());
  });
});

it('the profile page reads the one source, and builds no stickers from its own numbers (source check: see the header)', () => {
  const page = 'app/profile/[id].tsx';
  const src = readFileSync(join(__dirname, '..', page), 'utf8');
  expect([page, /\bmyStickers\(/.test(src)]).toEqual([page, true]);
  expect([page, /\bstickers\(\{/.test(src)]).toEqual([page, false]);
});
