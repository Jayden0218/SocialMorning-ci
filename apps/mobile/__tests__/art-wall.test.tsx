// Tests the sign-in wall of drawn tiles: its place, its tiles, no pictures, ready at once.
/**
 * M31 S-C (T061; design-pulse2 `signInPage`): the top 430 of the sign-in page is a wall of twelve painted tiles — three columns, rows
 * of 96 with 8 between, every fifth tile two rows tall, 12 from each side and 6 under the status bar, at 90 %, faded to the page from
 * 250 under the status bar. It was a moving row of words-only tiles (owner, 2026-10-04: no podcast covers — there is no permission to
 * show other people's artwork); it still shows none: nothing here is an `Image`, and the tile paints are colours.
 *
 * Break that turns the layout test red: change `i % 5 === 0` in `wallLayout` (src/ui/auth/ArtWall.tsx). The place test: change
 * `AUTH.wall.below` or `AUTH.wall.height` (src/ui/auth/measures.ts).
 */
import { createElement } from 'react';
import { Image, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ArtWall, WallFade, paintPoints, wallLayout } from '@/ui/auth/ArtWall';
import { WALL_ORDER, WALL_PAINTS } from '@/design/tokens';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

const INSETS = { top: 50, bottom: 34, left: 0, right: 0 };
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, el)); }); return r; };
const styleOf = (n: ReactTestInstance): Record<string, number> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, number>;
const host = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string')[0]!;

it('lays the twelve tiles out in three columns, every fifth two rows tall, the first column holding the tall ones', () => {
  const t = wallLayout();
  expect(t).toHaveLength(12);
  expect(t.map((x) => x.rows)).toEqual([2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1]);
  // The drawing's CSS grid: tile 0 at column 0 rows 0–1; tiles 1, 2 on row 0; 3, 4 on row 1; tile 5 at column 0 rows 2–3 …
  expect(t.slice(0, 6).map((x) => [x.column, x.row])).toEqual([[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [0, 2]]);
  expect(t.filter((x) => x.rows === 2).every((x) => x.column === 0)).toBe(true);
  expect(t.map((x) => x.key)).toEqual([...WALL_ORDER]);
});

it('sits 12 from each side, 6 under the status bar, 430 tall at 90 %, each tile 18 round, rows 96 with 8 between', () => {
  const r = render(createElement(ArtWall, {}));
  const wall = styleOf(host(r, 'art-wall'));
  expect(wall).toMatchObject({ left: 12, right: 12, top: 56, height: 430, opacity: 0.9 });
  const tiles = r.root.findAll((n) => n.props['testID'] === 'wall-tile' && typeof n.type === 'string').map(styleOf);
  expect(tiles).toHaveLength(12);
  expect(tiles[0]).toMatchObject({ top: 0, left: 0, height: 200, borderRadius: 18 });
  expect(tiles[1]!['top']).toBe(0);
  expect(tiles[1]!['height']).toBe(96);
  expect(tiles[3]!['top']).toBe(104);
  expect(tiles[5]!['top']).toBe(208);
  // Three equal columns 8 apart.
  expect(tiles[2]!['left']! - tiles[1]!['left']! - tiles[1]!['width']!).toBe(8);
  expect(tiles[1]!['width']).toBe(tiles[2]!['width']);
  act(() => r.unmount());
});

it('draws no picture at all, and hides itself from a screen reader', () => {
  const r = render(createElement(ArtWall, {}));
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(host(r, 'art-wall').props['importantForAccessibility']).toBe('no-hide-descendants');
  expect(JSON.stringify(WALL_PAINTS)).not.toMatch(/https?:|\.(png|jpe?g|webp)/i);
  act(() => r.unmount());
});

it('the fade starts 250 under the status bar and is 240 tall', () => {
  const r = render(createElement(WallFade, {}));
  // The gradient is a stand-in here, so it is found by its test id, not as a host view.
  expect(styleOf(r.root.findAll((n) => n.props['testID'] === 'wall-fade')[0]!)).toMatchObject({ top: 300, height: 240 });
  act(() => r.unmount());
});

it('is ready at once, and only once', () => {
  const onReady = jest.fn();
  const r = render(createElement(ArtWall, { onReady }));
  expect(onReady).toHaveBeenCalledTimes(1);
  act(() => { r.update(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(ArtWall, { onReady }))); });
  expect(onReady).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('a CSS angle becomes the gradient points: 180 is top to bottom, 90 left to right', () => {
  const down = paintPoints(180);
  expect(down.start.x).toBeCloseTo(0.5); expect(down.start.y).toBeCloseTo(0); expect(down.end.y).toBeCloseTo(1);
  const right = paintPoints(90);
  expect(right.start.x).toBeCloseTo(0); expect(right.end.x).toBeCloseTo(1); expect(right.start.y).toBeCloseTo(0.5);
});
