// Tests that tapping a row in "Up next" plays it and closes the sheet.
/**
 * M16a guard G-B6 (FR-002). Phone walk 2026-10-02: tapping a row in the "Up next" sheet did
 * nothing — the artwork and title were plain views; only the drag handle and ⋮ took a tap. A
 * row is now a button ("Play <title>") that plays the episode; the sheet closes on it.
 *
 * The break that turns it red: drop the `onPress` from the row's Pressable in
 * the Play circle in src/ui/queue/QueueList.tsx or from the deck card's in src/ui/player/QueueDeck.tsx (or the
 * `props.onClose()` from `play` in src/ui/queue/QueueSheet.tsx).
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockLoad = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) }, usePathname: () => '/episode/e1' }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ load: mockLoad }),
  // M31 T024 (C4): the sheet reads the player through selectors.
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'playing', episodeId: 'cur', positionMs: 0, lastSavedMs: 0 }),
}));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { social: () => Promise.resolve({ status: 404 }) } }) }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ episodeId: id }) }));
jest.mock('@/ui/shell/providers', () => {
  let queue: readonly string[] = ['e1', 'e2'];
  return {
    useStores: () => ({
      settings: { get: () => 'light' },
      queue: { list: () => queue, replace: (next: readonly string[]) => { queue = [...next]; } },
      feeds: {
        getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: ({ e1: 'Casey Wants to Believe', e2: 'Foot Terminal' } as Record<string, string>)[id] ?? 'The One Playing', durationMs: 2_057_000 }),
        getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
      },
      positions: { get: () => undefined },
      downloads: { get: () => undefined },
    }),
    useToast: () => jest.fn(),
    useDownloads: () => undefined,
  };
});

import { QueueList } from '@/ui/queue/QueueList';
import { QueueSheet } from '@/ui/queue/QueueSheet';

const stores = {
  feeds: {
    getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: id === 'e1' ? 'Casey Wants to Believe' : 'Foot Terminal', durationMs: 2_057_000 }),
    getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
  },
  positions: { get: () => undefined },
  downloads: { get: () => undefined },
} as never;

// M31 W3-B (design-pulse2 queue--screen): on the page a tap on a card opens the episode and the Play circle plays it.
it('the Play circle on a card plays that episode; a tap on the card opens it instead', () => {
  const onPlay = jest.fn();
  const onOpen = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(QueueList, { ids: ['e1', 'e2'], stores, onChange: jest.fn(), onPlay, onOpen })); });
  const find = (label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
  const circle = find('Play Foot Terminal');
  expect(circle).toBeDefined();
  act(() => { circle!.props['onPress'](); });
  expect(onPlay).toHaveBeenCalledWith('e2');
  expect(onOpen).not.toHaveBeenCalled();
  const card = find('Open Foot Terminal');
  expect(card).toBeDefined();
  act(() => { card!.props['onPress'](); });
  expect(onOpen).toHaveBeenCalledWith('e2');
  expect(onPlay).toHaveBeenCalledTimes(1);
});

it('the sheet closes when a row plays (and the row plays through the sheet)', () => {
  // The sheet's open spring runs on timers: fake them, and drain them before the file ends.
  jest.useFakeTimers();
  const onClose = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(QueueSheet, { open: true, onClose })); });
  try {
    const row = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Play Foot Terminal' && typeof n.props['onPress'] === 'function')[0];
    expect(row).toBeDefined();
    act(() => { row!.props['onPress'](); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledWith({ episodeId: 'e2' }, 'play');
    expect(mockPush).not.toHaveBeenCalled();
  } finally {
    act(() => { r.unmount(); });
    act(() => { for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
