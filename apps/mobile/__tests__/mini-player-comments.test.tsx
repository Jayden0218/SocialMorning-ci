// Tests that the mini player hides on the comments page.
/**
 * Owner, 2026-10-01: the mini player stands down on the comments page, which has its own
 * episode card with play/pause and a write box where the bar would sit.
 *
 * The break that turns it red: remove the `/comments/` line from MiniPlayer.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  usePathname: () => '/',
  useIsFocused: () => true,
  router: { push: jest.fn() },
}));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ play: jest.fn(), pause: jest.fn(), sleepRemainingMs: () => undefined, sleepTimer: () => ({ endOfEpisode: false }) }),
  // M31 T024 (C4): the bar reads the player through selectors; the real ones run over this state.
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'playing', episodeId: 'e1', positionMs: 0 }),
}));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light' },
    feeds: {
      getEpisode: (id: string) => (id === 'e1' ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Ep' } : undefined),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Show' }),
    },
  }),
}));

const mockOpenQueue = jest.fn();
// M21 US3: ≡ opens the root's playlist sheet (src/ui/queue/QueueSheetHost.tsx).
jest.mock('@/ui/queue/QueueSheetHost', () => ({ useQueueSheet: () => ({ open: mockOpenQueue, close: jest.fn() }) }));

import { MiniPlayer } from '@/ui/player/MiniPlayer';

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  return r;
};

it('is absent on the comments page while an episode plays, and present on the show page', () => {
  expect(render(createElement(MiniPlayer, { pathname: '/comments/e1' })).toJSON()).toBeNull();
  // M31 W3-A (T040): the Episode page draws its own tray where the bar would float, so the bar stands down there (m31-w3a-bars.test.ts).
  expect(render(createElement(MiniPlayer, { pathname: '/show/x' })).toJSON()).not.toBeNull();
});
