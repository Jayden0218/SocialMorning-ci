// Tests that the sign-in row shows words-only tiles, no pictures, and is ready at once.
/**
 * The sign-in page's moving row (owner, 2026-10-04): tiles made by the app, words only — the
 * owner has no permission to show other people's podcast covers. Nothing loads, so `onReady`
 * fires once, straight away. The row is drawn twice for the loop and moves one tile per tick.
 *
 * Break that turns the first test red: put an `<Image>` back into a tile.
 */
import { createElement } from 'react';
import { Image, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ArtWall, nextStep } from '@/ui/auth/ArtWall';
import { LANDING_TILES } from '@/ui/auth/art';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };

it('draws every tile as words, twice for the loop, with no picture anywhere', () => {
  const r = render(createElement(ArtWall, { tiles: LANDING_TILES }));
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  const words = r.root.findAllByType(Text).map((t) => [t.props['children']].flat().join(''));
  for (const t of LANDING_TILES) {
    expect(words.filter((w) => w === t.title)).toHaveLength(2);
    expect(words.filter((w) => w === t.kicker)).toHaveLength(2);
  }
  act(() => { r.unmount(); });
});

it('the tiles are the app\'s own words: no web address, no show artwork', () => {
  expect(LANDING_TILES.length).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(LANDING_TILES)).not.toMatch(/https?:|\.(png|jpe?g|webp)/i);
});

it('is ready at once, and only once', () => {
  const onReady = jest.fn();
  const r = render(createElement(ArtWall, { tiles: LANDING_TILES, onReady }));
  expect(onReady).toHaveBeenCalledTimes(1);
  act(() => { r.update(createElement(ArtWall, { tiles: LANDING_TILES, onReady })); });
  expect(onReady).toHaveBeenCalledTimes(1);
  const none = jest.fn();
  render(createElement(ArtWall, { tiles: [], onReady: none }));
  expect(none).toHaveBeenCalledTimes(1);
});

it('moves one tile per tick and snaps back after the last', () => {
  expect(nextStep(0, 3)).toEqual({ to: 1, snapBack: false });
  expect(nextStep(1, 3)).toEqual({ to: 2, snapBack: false });
  expect(nextStep(2, 3)).toEqual({ to: 3, snapBack: true });
});
