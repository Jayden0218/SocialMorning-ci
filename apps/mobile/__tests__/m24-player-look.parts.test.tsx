// Tests the playlist sheet's header (M31: "Playlist", spoken as a header, with its close circle).
/**
 * M24 US19 guard G-M24-B2, the parts split out of m24-player-look.test.tsx because they need the
 * queue sheet's mocks (router, player, stores). Rendered, not read. M31 T024: the mini player's ring and
 * steady digits are the kit NowBar's now (mini-player.test.tsx, now-bar.test.tsx); the sheet is titled
 * "Playlist" and has a close circle. How it looks on a phone is NOT VERIFIED until the head installs a build.
 *
 * The break that turns it red: retitle the sheet header in src/ui/queue/QueueSheet.tsx away from
 * "Playlist" (or drop its `accessibilityRole="header"`), or drop its close circle.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockQueue: readonly string[] = [];

jest.mock('expo-router', () => ({
  // `asChild` hands the press to the child; for rendering, the child IS the output.
  Link: ({ children }: { children: React.ReactNode }) => children,
  usePathname: () => '/',
  useIsFocused: () => true,
  router: { push: jest.fn() },
}));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ play: jest.fn(), pause: jest.fn(), load: jest.fn(), sleepRemainingMs: () => undefined, sleepTimer: () => ({ endOfEpisode: false }) }),
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'playing', episodeId: 'e1', positionMs: 30_000, lastSavedMs: 0 }),
}));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ episodeId: id }) }));
jest.mock('@/settings/queue', () => ({ queueEpisode: jest.fn() }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ useQueueSheet: () => ({ open: jest.fn(), close: jest.fn() }) }));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light' },
    queue: { list: () => mockQueue, replace: (next: readonly string[]) => { mockQueue = [...next]; } },
    feeds: {
      getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: id === 'e1' ? 'Casey Wants to Believe' : `Ep ${id}`, durationMs: 600_000 }),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
    },
    positions: { get: () => undefined },
    downloads: { get: () => undefined },
  }),
  useToast: () => jest.fn(),
  useDownloads: () => undefined,
}));

import { QueueSheet } from '@/ui/queue/QueueSheet';

// The queue sheet's open spring runs on timers: keep them fake,
// unmount every renderer and drain what is left (as queue-sheet.test.tsx does).
const rendered: ReactTestRenderer[] = [];
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  rendered.push(r);
  return r;
};
beforeEach(() => {
  jest.useFakeTimers();
  mockQueue = ['e2', 'e3'];
});
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => {
    for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers();
  });
  jest.clearAllTimers();
  jest.useRealTimers();
});
afterAll(() => { jest.clearAllTimers(); });

describe('the queue sheet', () => {
  it('is titled "Playlist", spoken as a header, with a close circle', () => {
    const r = render(createElement(QueueSheet, { open: true, onClose: jest.fn() }));
    const head = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header' && n.props['children'] === 'Playlist');
    expect(head.length).toBeGreaterThan(0);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close' && typeof n.props['onPress'] === 'function').length).toBeGreaterThan(0);
  });
});
