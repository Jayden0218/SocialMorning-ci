// Tests the playlist sheet: playing now first, ▶ plays a row, Edit removes many, Clear all keeps the playing one.
/**
 * M21 US3 (FR-020/021/022), quickstart B7's Independent Test in Jest: queue 5 episodes; the sheet
 * shows the playing episode first and marked; Edit → select 2 → Remove: 3 are left; Clear all
 * (after our own confirm): only the playing episode remains. Also the shared Sheet's settle rule,
 * the player's swipe-up rule, the long-press "Added to the front", and where the sheet is mounted.
 *
 * The break that turns it red: drop `current` from `clearQueue(ids, current)` in
 * src/ui/queue/QueueSheet.tsx (Clear all then empties the playing episode out of the queue), or
 * put the `<Link href="/queue">` back around the mini player's ≡.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockLoad = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockQueueEpisode = jest.fn();
let mockQueue: readonly string[] = [];
let mockAsked: { title: string; action?: string; onConfirm?: () => void } | undefined;

const TITLES: Record<string, string> = { cur: 'The One Playing', e1: 'Ep One', e2: 'Ep Two', e3: 'Ep Three', e4: 'Ep Four', e5: 'Ep Five' };

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/playback/store', () => ({
  usePlayer: () => ({ load: mockLoad }),
  usePlayerState: () => ({ kind: 'playing', episodeId: 'cur', positionMs: 0, lastSavedMs: 0 }),
}));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ episodeId: id }) }));
jest.mock('@/settings/queue', () => ({ queueEpisode: (...a: unknown[]) => mockQueueEpisode(...a) }));
// Our own confirm draws through gluestack's portal (absent here): record the question instead.
jest.mock('@/ui/kit/confirm', () => ({
  useConfirm: () => [(r: { title: string; action?: string; onConfirm?: () => void }) => { mockAsked = r; }, null],
}));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light' },
    queue: { list: () => mockQueue, replace: (next: readonly string[]) => { mockQueue = [...next]; } },
    feeds: {
      getEpisode: (id: string) => (TITLES[id] ? { id, feedUrl: 'https://f/x.xml', title: TITLES[id], durationMs: 600_000 } : undefined),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
    },
    positions: { get: () => undefined },
    downloads: { get: () => undefined },
  }),
  useToast: () => mockToast,
  useDownloads: () => undefined,
}));

import { QueueSheet } from '@/ui/queue/QueueSheet';
import { QueueButtons } from '@/ui/queue/QueueButtons';
import { isSwipeUp, startsSwipeUp } from '@/ui/queue/QueueSheetHost';
import { CLOSE_SLACK, dragHeight, settle } from '@/ui/kit/Sheet';

// M23 T053: the sheet's open spring kept firing after the file ended ("accessed the Jest
// environment after it has been torn down", 9 times a run). Timers are fake, and after each
// test every renderer is unmounted and the leftover animation frames are drained here.
const rendered: ReactTestRenderer[] = [];
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  rendered.push(r);
  return r;
};
const press = (r: ReactTestRenderer, label: string) => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  act(() => { n.props['onPress'](); });
};
const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((x) => typeof x.type === 'string' && typeof x.props['accessibilityLabel'] === 'string').map((x) => x.props['accessibilityLabel'] as string);

afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => {
    for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers();
  });
  jest.clearAllTimers();
  jest.useRealTimers();
});

beforeEach(() => {
  jest.useFakeTimers();
  mockQueue = ['e1', 'e2', 'e3', 'e4', 'e5'];
  mockAsked = undefined;
  mockLoad.mockClear(); mockPush.mockClear(); mockToast.mockClear(); mockQueueEpisode.mockClear();
});

it('shows the playing episode first, marked, then every queued episode with its own Play', () => {
  const r = render(createElement(QueueSheet, { open: true, onClose: jest.fn() }));
  const all = labels(r);
  const now = all.indexOf('Now playing: The One Playing');
  expect(now).toBeGreaterThanOrEqual(0);
  for (const id of ['e1', 'e2', 'e3', 'e4', 'e5']) expect(all.indexOf(`Play ${TITLES[id]}`)).toBeGreaterThan(now);
  // The playing episode is not a queue row (no Play for it).
  expect(all).not.toContain('Play The One Playing');
});

it('▶ on a row plays it at once, takes it off the queue and closes the sheet', () => {
  const onClose = jest.fn();
  const r = render(createElement(QueueSheet, { open: true, onClose }));
  press(r, 'Play Ep Two');
  expect(mockLoad).toHaveBeenCalledWith({ episodeId: 'e2' }, 'play');
  expect(mockQueue).toEqual(['e1', 'e3', 'e4', 'e5']);
  expect(onClose).toHaveBeenCalled();
});

it('Edit → select 2 → Remove (2): 3 are left', () => {
  const r = render(createElement(QueueSheet, { open: true, onClose: jest.fn() }));
  press(r, 'Edit');
  press(r, 'Select Ep Two');
  press(r, 'Select Ep Four');
  const checked = r.root.findAll((x) => typeof x.type === 'string' && x.props['accessibilityRole'] === 'checkbox' && x.props['accessibilityState']?.checked === true);
  expect(checked).toHaveLength(2);
  press(r, 'Remove (2)');
  expect(mockQueue).toEqual(['e1', 'e3', 'e5']);
  expect(labels(r)).toContain('Remove (0)');
});

it('Clear all asks once, then keeps only the playing episode', () => {
  mockQueue = ['e1', 'cur', 'e2'];
  const r = render(createElement(QueueSheet, { open: true, onClose: jest.fn() }));
  press(r, 'Edit');
  press(r, 'Clear all');
  expect(mockQueue).toEqual(['e1', 'cur', 'e2']); // nothing until confirmed
  expect(mockAsked?.action).toBe('Clear all');
  act(() => { mockAsked?.onConfirm?.(); });
  expect(mockQueue).toEqual(['cur']);
});

it('the backdrop closes the sheet; the handle is a button for anyone who cannot drag', () => {
  const onClose = jest.fn();
  const r = render(createElement(QueueSheet, { open: true, onClose }));
  expect(labels(r)).toContain('Make the sheet taller');
  press(r, 'Close');
  expect(onClose).toHaveBeenCalled();
});

it('Sheet: a release settles on the nearest height; far enough under the lowest (or a flick down) closes', () => {
  const hs = [400, 736];
  expect(settle(hs, 420, 0)).toBe(0);
  expect(settle(hs, 700, 0)).toBe(1);
  expect(settle(hs, 500, -2)).toBe(1); // a flick up carries it to full height
  expect(settle(hs, 400 - CLOSE_SLACK + 1, 0)).toBe(0); // a small wobble stays open
  expect(settle(hs, 400 - CLOSE_SLACK - 1, 0)).toBe(-1);
  expect(settle(hs, 390, 2)).toBe(-1); // a flick down closes
  expect(dragHeight(400, -500, 736)).toBe(736);
  expect(dragHeight(400, 500, 736)).toBe(0);
  expect(dragHeight(400, -100, 736)).toBe(500);
});

it('the player swipe: at least 20 pt up and more up than sideways', () => {
  expect(isSwipeUp(0, -21)).toBe(true);
  expect(isSwipeUp(0, -20)).toBe(false);
  expect(isSwipeUp(30, -25)).toBe(false);
  expect(isSwipeUp(0, 40)).toBe(false);
  // iPhone walk 2026-10-07: a flick is claimed from 5 pt up and decided on release.
  expect(startsSwipeUp(0, -6)).toBe(true);
  expect(startsSwipeUp(0, -5)).toBe(false);
  expect(startsSwipeUp(10, -6)).toBe(false);
  expect(startsSwipeUp(0, 6)).toBe(false);
});

it('a long-press on Add to queue adds to the front: "Added to the front"', () => {
  mockQueueEpisode.mockReturnValue({ kind: 'queued', where: 'front', evicted: false, downloading: false });
  const r = render(createElement(QueueButtons, { episodeId: 'e9' }));
  const tile = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Add to queue' && typeof x.props['onLongPress'] === 'function')[0]!;
  act(() => { tile.props['onLongPress'](); });
  expect(mockQueueEpisode.mock.calls[0]![2]).toBe('e9');
  expect(mockQueueEpisode.mock.calls[0]![4]).toBe('front');
  expect(mockToast).toHaveBeenLastCalledWith('Added to the front');
  // A tap still adds to the end.
  mockQueueEpisode.mockReturnValue({ kind: 'queued', where: 'end', evicted: false, downloading: false });
  act(() => { tile.props['onPress'](); });
  expect(mockQueueEpisode.mock.calls[1]![4]).toBe('end');
  expect(mockToast).toHaveBeenLastCalledWith('Added to the queue');
});

it('one sheet for the app: mounted at the root inside the providers; the mini player and the player open it', () => {
  const root = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  const layout = root('app/_layout.tsx');
  const body = layout.slice(layout.indexOf('export default function RootLayout'));
  expect(body.indexOf('<QueueSheetHost>')).toBeGreaterThan(body.indexOf('<AppProviders>'));
  expect(body.indexOf('<QueueSheetHost>')).toBeLessThan(body.indexOf('<RootStack />'));
  const mini = root('src/ui/player/MiniPlayer.tsx');
  expect(mini).not.toMatch(/href="\/queue"/);
  expect(mini).toMatch(/queueSheet\.open\(\)/);
  const player = root('app/player.tsx');
  expect(player).not.toMatch(/<QueueSheet\b/);
  expect(player).toMatch(/\{\.\.\.swipeUp\}/);
});
