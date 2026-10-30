// Tests the M24 player look on the mini player (yellow ring, steady digits) and the queue sheet's "Up next" title.
/**
 * M24 US19 guard G-M24-B2, the parts split out of m24-player-look.test.tsx because they need the
 * mini player's and the queue sheet's mocks (router, player, stores). Rendered, not read: these
 * replaced source scans of src/ui/player/MiniPlayer.tsx and src/ui/queue/QueueSheet.tsx.
 * How it looks on a phone is NOT VERIFIED until the head installs a build.
 *
 * The break that turns it red: in src/ui/player/MiniPlayer.tsx drop the `<PlayRing>` around the
 * play/pause glyph or the `style={tabular}` on the time line; or retitle the sheet header in
 * src/ui/queue/QueueSheet.tsx away from "Up next" (or drop its `accessibilityRole="header"`).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
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
  usePlayer: () => ({ play: jest.fn(), pause: jest.fn(), load: jest.fn(), sleepRemainingMs: () => undefined, sleepTimer: () => ({ endOfEpisode: false }) }),
  usePlayerState: () => ({ kind: 'playing', episodeId: 'e1', positionMs: 30_000, lastSavedMs: 0 }),
}));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ episodeId: id }) }));
jest.mock('@/settings/queue', () => ({ queueEpisode: jest.fn() }));
jest.mock('@/ui/kit/confirm', () => ({ useConfirm: () => [jest.fn(), null] }));
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

import { MiniPlayer } from '@/ui/player/MiniPlayer';
import { PlayRing } from '@/ui/player/PlayRing';
import { QueueSheet } from '@/ui/queue/QueueSheet';

// The queue sheet's open spring and the mini player's marquee run on timers: keep them fake,
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

describe('the mini player', () => {
  it('draws its own yellow PlayRing around the play/pause button', () => {
    const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
    const button = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Pause' && typeof n.props['onPress'] === 'function')[0];
    expect(button).toBeDefined();
    expect(button!.findAllByType(PlayRing)).toHaveLength(1);
  });

  it('the position line uses tabular digits, so it keeps its width as the seconds tick', () => {
    const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
    const words = (c: unknown): string => ([] as unknown[]).concat(c).filter((x) => typeof x === 'string').join('');
    const line = r.root.findAll((n) => typeof n.type === 'string' &&/^\d+:\d\d\/\d+:\d\d/.test(words(n.props['children'])));
    expect(line.length).toBeGreaterThan(0);
    const style = (StyleSheet.flatten(line[0]!.props['style']) ?? {}) as Record<string, unknown>;
    expect(style['fontVariant']).toEqual(['tabular-nums']);
  });
});

describe('the queue sheet', () => {
  it('is titled "Up next", spoken as a header', () => {
    const r = render(createElement(QueueSheet, { open: true, onClose: jest.fn() }));
    const head = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header' && n.props['children'] === 'Up next');
    expect(head.length).toBeGreaterThan(0);
  });
});
