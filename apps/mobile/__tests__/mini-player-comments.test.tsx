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
}));
jest.mock('../src/playback/store', () => ({
  usePlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  usePlayerState: () => ({ kind: 'playing', episodeId: 'e1', positionMs: 0 }),
}));
jest.mock('../src/ui/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light' },
    feeds: {
      getEpisode: (id: string) => (id === 'e1' ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Ep' } : undefined),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Show' }),
    },
  }),
}));

import { MiniPlayer } from '../src/ui/MiniPlayer';

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  return r;
};

it('is absent on the comments page while an episode plays, and present on the episode page', () => {
  expect(render(createElement(MiniPlayer, { pathname: '/comments/e1' })).toJSON()).toBeNull();
  expect(render(createElement(MiniPlayer, { pathname: '/episode/e1' })).toJSON()).not.toBeNull();
});
