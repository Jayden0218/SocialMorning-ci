// Tests that tapping a row in "Up next" plays it and closes the sheet.
/**
 * M16a guard G-B6 (FR-002). Phone walk 2026-10-02: tapping a row in the "Up next" sheet did
 * nothing — the artwork and title were plain views; only the drag handle and ⋮ took a tap. A
 * row is now a button ("Play <title>") that plays the episode; the sheet closes on it.
 *
 * The break that turns it red: drop the `onPress` from the row's Pressable in
 * src/ui/queue/QueueList.tsx (or the `props.onClose()` from `play` in src/ui/queue/QueueSheet.tsx).
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockLoad = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/playback/store', () => ({
  usePlayer: () => ({ load: mockLoad }),
  usePlayerState: () => ({ kind: 'playing', episodeId: 'cur', positionMs: 0, lastSavedMs: 0 }),
}));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ episodeId: id }) }));
// Our own confirm draws through gluestack's portal (absent here); the sheet only needs the hook.
jest.mock('@/ui/kit/confirm', () => ({ useConfirm: () => [jest.fn(), null] }));
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

it('tapping a row plays that episode', () => {
  const onPlay = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(QueueList, { ids: ['e1', 'e2'], stores, colours: { text: 'x', muted: 'x', accent: 'x' }, onChange: jest.fn(), onPlay })); });
  const row = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Play Foot Terminal' && typeof n.props['onPress'] === 'function')[0];
  expect(row).toBeDefined();
  act(() => { row!.props['onPress'](); });
  expect(onPlay).toHaveBeenCalledWith('e2');
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
