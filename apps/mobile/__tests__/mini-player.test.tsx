// Tests when the mini player shows, what it shows, and opening the player.
/**
 * `MiniPlayer` (M7 T011) replaces `MiniBar`. The look changed; the contract did not.
 *
 * Two of these assertions exist because of the phone, not because of a design:
 *  - the bar must be **absent on `/player`** — `docs/archive/m7-before/06-player.png` caught the
 *    old one drawing underneath the full player, so the episode announced twice;
 *  - the play/pause button's **name flips with the state** — M6's J5 drove the player by
 *    accessible name alone, and that only worked because this label is state-driven.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour, hit } from '@/design';

const mockPause = jest.fn();
const mockPlay = jest.fn();
let mockPlayerState: Record<string, unknown> = { kind: 'idle' };
let mockFocused = true;
let mockSleepLeft: number | undefined;
let mockSleepEnd = false;

jest.mock('expo-router', () => ({
  // `asChild` hands the press to the child; for rendering, the child IS the output.
  Link: ({ children }: { children: React.ReactNode }) => children,
  usePathname: () => '/',
  useIsFocused: () => mockFocused,
}));
jest.mock('@/playback/store', () => ({
  usePlayer: () => ({ play: mockPlay, pause: mockPause, sleepRemainingMs: () => mockSleepLeft, sleepTimer: () => ({ endOfEpisode: mockSleepEnd }) }),
  usePlayerState: () => mockPlayerState,
}));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    // M10b US4: MiniPlayer and its ProgressRing read the palette; pin it to light.
    settings: { get: () => 'light' },
    feeds: {
      getEpisode: (id: string) =>
        id === 'e1'
          ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Casey Wants to Believe', imageUrl: 'https://img/ep.png' }
          : undefined,
      getShow: (url: string) => (url === 'https://f/x.xml' ? { feedUrl: url, title: 'Reply All' } : undefined),
    },
  }),
}));

import { MiniPlayer, TabsMiniPlayer } from '@/ui/player/MiniPlayer';
import { MINI_PLAYER_HEIGHT } from '@/ui/kit/Screen';
import { TAB_HREF } from '@/ui/shell/tabs';

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
};
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
/** The host node: what Android exposes — accessibility props and the resolved style. */
const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === label)[0];
/** The composite: the only one that carries `onPress`. */
const pressable = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];

beforeEach(() => {
  mockPlayerState = { kind: 'idle' };
  mockPlay.mockClear();
  mockPause.mockClear();
});

it('is absent when nothing is loaded — an empty bar on every screen is what looks unfinished', () => {
  expect(render(createElement(MiniPlayer)).toJSON()).toBeNull();
});

it('is absent on /player, where the full player already draws the same episode', () => {
  mockPlayerState = { kind: 'playing', episodeId: 'e1' };
  expect(render(createElement(MiniPlayer, { pathname: '/player' })).toJSON()).toBeNull();
  // …and present everywhere else, with the same state.
  expect(render(createElement(MiniPlayer, { pathname: '/episode/e1' })).toJSON()).not.toBeNull();
});

it('is absent on the sign-in pages (owner, 2026-09-27), even while an episode plays', () => {
  mockPlayerState = { kind: 'playing', episodeId: 'e1' };
  for (const p of ['/auth/sign-in', '/auth/email', '/auth/sign-up']) {
    expect(render(createElement(MiniPlayer, { pathname: p })).toJSON()).toBeNull();
  }
});

it('shows the episode, the show and the artwork, and opens the player', () => {
  mockPlayerState = { kind: 'paused', episodeId: 'e1' };
  const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  const text = JSON.stringify(r.toJSON());
  expect(text).toContain('Casey Wants to Believe');
  expect(text).toContain('Reply All');
  expect(text).toContain('https://img/ep.png');
  const link = byLabel(r, 'Now playing: Casey Wants to Believe. Open the player.');
  expect(link?.props['accessibilityRole']).toBe('link');
});

it('with a length known, the second line is the time — "26:37/1:30:28", as in the reference — and Queue is one tap away', () => {
  mockPlayerState = { kind: 'paused', episodeId: 'e1', positionMs: 1_597_000, durationMs: 5_428_000 };
  const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  expect(JSON.stringify(r.toJSON())).toContain('26:37/1:30:28');
  expect(byLabel(r, 'Queue')?.props['accessibilityRole']).toBe('link');
});

it('the play/pause button carries the state in its NAME, not only in its glyph', () => {
  mockPlayerState = { kind: 'paused', episodeId: 'e1' };
  const paused = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  const play = byLabel(paused, 'Play')!;
  expect(play.props['accessibilityRole']).toBe('button');
  expect(play.props['accessibilityState']).toEqual({ selected: false });
  act(() => pressable(paused, 'Play')!.props['onPress']());
  expect(mockPlay).toHaveBeenCalledTimes(1);

  mockPlayerState = { kind: 'playing', episodeId: 'e1' };
  const playing = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  const pause = byLabel(playing, 'Pause')!;
  expect(pause.props['accessibilityState']).toEqual({ selected: true });
  act(() => pressable(playing, 'Pause')!.props['onPress']());
  expect(mockPause).toHaveBeenCalledTimes(1);

  // Buffering is still "playing" to a listener: the button must offer Pause.
  mockPlayerState = { kind: 'buffering', episodeId: 'e1' };
  expect(byLabel(render(createElement(MiniPlayer, { pathname: '/episode/e1' })), 'Pause')).toBeDefined();
});

it('an error is shown in the bar, in the accent, and never as a silent empty bar', () => {
  mockPlayerState = { kind: 'error', message: 'This episode would not load.' };
  const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  expect(JSON.stringify(r.toJSON())).toContain('This episode would not load.');
  expect(byLabel(r, 'Play')).toBeUndefined();
});

it('reserves its height with minHeight, so the largest system font grows the bar instead of clipping', () => {
  mockPlayerState = { kind: 'paused', episodeId: 'e1' };
  const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  const bar = flat(r.root.findAll((n) => typeof n.type === 'string')[0]!.props['style']);
  expect(bar['height']).toBeUndefined();
  expect(bar['minHeight']).toBe(MINI_PLAYER_HEIGHT);
  expect(bar['backgroundColor']).toBe(colour.surface); // M17: the white Editorial bar
  const button = flat(byLabel(r, 'Play')!.props['style']);
  expect(Number(button['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  expect(Number(button['minWidth'])).toBeGreaterThanOrEqual(hit.min);
});

it('exactly one bar: the root instance stands down on a tab route, where the tab layout draws its own', () => {
  mockPlayerState = { kind: 'playing', episodeId: 'e1' };
  // Every tab the app has, read from the tab definitions — the hard-coded list this test used
  // to carry went stale with the code, so /library drew two bars (iOS defect i12).
  for (const path of [...Object.values(TAB_HREF), '/discover', '/following']) {
    expect(render(createElement(MiniPlayer, { pathname: path, context: 'root' })).toJSON()).toBeNull();
    expect(render(createElement(MiniPlayer, { pathname: path, context: 'tabs' })).toJSON()).not.toBeNull();
  }
  // Off the tabs, the root instance is the only one mounted, and it shows.
  expect(render(createElement(MiniPlayer, { pathname: '/episode/e1', context: 'root' })).toJSON()).not.toBeNull();
});

it('G-B3: the bar above the tab bar draws only while the tabs are focused — never beside the root bar mid-swipe (M12 B3)', () => {
  mockPlayerState = { kind: 'paused', episodeId: 'e1' };
  mockFocused = false;
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(TabsMiniPlayer)); });
  expect(r.toJSON()).toBeNull();
  mockFocused = true;
  act(() => { r = create(createElement(TabsMiniPlayer)); });
  expect(r.toJSON()).not.toBeNull();
});

it('M21 FR-004: while a sleep timer runs, the second line also shows its time left — or "at end"', () => {
  mockPlayerState = { kind: 'playing', episodeId: 'e1', positionMs: 1_597_000, durationMs: 5_428_000 };
  mockSleepLeft = 299_000;
  const r = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  expect(JSON.stringify(r.toJSON())).toContain('sleep 4:59');
  mockSleepLeft = undefined;
  mockSleepEnd = true;
  const end = render(createElement(MiniPlayer, { pathname: '/episode/e1' }));
  expect(JSON.stringify(end.toJSON())).toContain('sleep at end');
  mockSleepEnd = false;
});
