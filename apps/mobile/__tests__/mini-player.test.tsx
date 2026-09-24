/**
 * `MiniPlayer` (M7 T011) replaces `MiniBar`. The look changed; the contract did not.
 *
 * Two of these assertions exist because of the phone, not because of a design:
 *  - the bar must be **absent on `/player`** — `docs/m7-before/06-player.png` caught the
 *    old one drawing underneath the full player, so the episode announced twice;
 *  - the play/pause button's **name flips with the state** — M6's J5 drove the player by
 *    accessible name alone, and that only worked because this label is state-driven.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour, hit } from '../src/design';

const mockPause = jest.fn();
const mockPlay = jest.fn();
let playerState: Record<string, unknown> = { kind: 'idle' };

jest.mock('expo-router', () => ({
  // `asChild` hands the press to the child; for rendering, the child IS the output.
  Link: ({ children }: { children: React.ReactNode }) => children,
  usePathname: () => '/',
}));
jest.mock('../src/playback/store', () => ({
  usePlayer: () => ({ play: mockPlay, pause: mockPause }),
  usePlayerState: () => playerState,
}));
jest.mock('../src/ui/providers', () => ({
  useStores: () => ({
    feeds: {
      getEpisode: (id: string) =>
        id === 'e1'
          ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Casey Wants to Believe', imageUrl: 'https://img/ep.png' }
          : undefined,
      getShow: (url: string) => (url === 'https://f/x.xml' ? { feedUrl: url, title: 'Reply All' } : undefined),
    },
  }),
}));

import { MiniPlayer } from '../src/ui/MiniPlayer';
import { MINI_PLAYER_HEIGHT } from '../src/ui/Screen';

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
};
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label)[0];

beforeEach(() => {
  playerState = { kind: 'idle' };
  mockPlay.mockClear();
  mockPause.mockClear();
});

it('is absent when nothing is loaded — an empty bar on every screen is what looks unfinished', () => {
  expect(render(createElement(MiniPlayer)).toJSON()).toBeNull();
});

it('is absent on /player, where the full player already draws the same episode', () => {
  playerState = { kind: 'playing', episodeId: 'e1' };
  expect(render(createElement(MiniPlayer, { pathname: '/player' })).toJSON()).toBeNull();
  // …and present everywhere else, with the same state.
  expect(render(createElement(MiniPlayer, { pathname: '/discover' })).toJSON()).not.toBeNull();
});

it('shows the episode, the show and the artwork, and opens the player', () => {
  playerState = { kind: 'paused', episodeId: 'e1' };
  const r = render(createElement(MiniPlayer, { pathname: '/' }));
  const text = JSON.stringify(r.toJSON());
  expect(text).toContain('Casey Wants to Believe');
  expect(text).toContain('Reply All');
  expect(text).toContain('https://img/ep.png');
  const link = byLabel(r, 'Now playing: Casey Wants to Believe. Open the player.');
  expect(link?.props['accessibilityRole']).toBe('link');
});

it('the play/pause button carries the state in its NAME, not only in its glyph', () => {
  playerState = { kind: 'paused', episodeId: 'e1' };
  const paused = render(createElement(MiniPlayer, { pathname: '/' }));
  const play = byLabel(paused, 'Play')!;
  expect(play.props['accessibilityRole']).toBe('button');
  expect(play.props['accessibilityState']).toEqual({ selected: false });
  act(() => play.props['onPress']());
  expect(mockPlay).toHaveBeenCalledTimes(1);

  playerState = { kind: 'playing', episodeId: 'e1' };
  const playing = render(createElement(MiniPlayer, { pathname: '/' }));
  const pause = byLabel(playing, 'Pause')!;
  expect(pause.props['accessibilityState']).toEqual({ selected: true });
  act(() => pause.props['onPress']());
  expect(mockPause).toHaveBeenCalledTimes(1);

  // Buffering is still "playing" to a listener: the button must offer Pause.
  playerState = { kind: 'buffering', episodeId: 'e1' };
  expect(byLabel(render(createElement(MiniPlayer, { pathname: '/' })), 'Pause')).toBeDefined();
});

it('an error is shown in the bar, in the accent, and never as a silent empty bar', () => {
  playerState = { kind: 'error', message: 'This episode would not load.' };
  const r = render(createElement(MiniPlayer, { pathname: '/' }));
  expect(JSON.stringify(r.toJSON())).toContain('This episode would not load.');
  expect(byLabel(r, 'Play')).toBeUndefined();
});

it('reserves its height with minHeight, so the largest system font grows the bar instead of clipping', () => {
  playerState = { kind: 'paused', episodeId: 'e1' };
  const r = render(createElement(MiniPlayer, { pathname: '/' }));
  const bar = flat(r.root.findAll((n) => typeof n.type === 'string')[0]!.props['style']);
  expect(bar['height']).toBeUndefined();
  expect(bar['minHeight']).toBe(MINI_PLAYER_HEIGHT);
  expect(bar['backgroundColor']).toBe(colour.surface);
  const button = flat(byLabel(r, 'Play')!.props['style']);
  expect(Number(button['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  expect(Number(button['minWidth'])).toBeGreaterThanOrEqual(hit.min);
});
