// Tests the top of Discover as drawn: the pick tile, Hot now, the shortcut tiles and the offline tile.
/**
 * M31 T025 (design-pulse2 `discover--screen`, `home--screen`, `home--offline`). The pick is 2 wide and 3
 * tall (272); Hot now is 1 x 2 (178) beside the first two shortcuts; the rest of the shortcuts run two to
 * a row, 84 tall; offline with nothing cached is one dashed 2 x 2 tile and the shortcuts still work.
 * Every old action of the pick card (open, Play, "+", Past picks) and of the shortcut grid is here under
 * its old name. The break that turns it red: draw Hot now without its `onPress`, or drop the
 * `props.hot ? … : []` split so the shortcuts are drawn twice.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { DiscoverMosaic, HOT_HEIGHT, MOSAIC, PICK_HEIGHT, pairs, type MosaicActions, type ShortcutTile } from '@/ui/discover/DiscoverMosaic';
import type { Moment } from '@/discover/moments-api';
import type { PickWithFaces } from '@/discover/explore-api';

jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));

const PICK = { kind: 'pick', key: 'k', why: 'Short, warm, and good with coffee.', episode: { id: 'e1', feedUrl: 'https://f', guid: 'g', title: 'Why mornings matter', showTitle: 'Morning Notes', enclosureUrl: 'https://a.mp3' } } as unknown as PickWithFaces;
const HOT: Moment = { episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [{ id: 'c', author: 'Rui', text: 'the part I replay', likes: 1 }] };
const tiles = (n: number, tinted?: number): ShortcutTile[] => Array.from({ length: n }, (_, i) => ({ label: `T${i}`, icon: 'grid-outline', onPress: jest.fn(), ...(i === tinted ? { tinted: true } : {}) }));
const acts = (): MosaicActions => ({ onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onPast: jest.fn(), onHot: jest.fn() });
const flat = (n: ReactTestInstance) => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
function mosaic(p: Partial<Parameters<typeof DiscoverMosaic>[0]> = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(DiscoverMosaic, { pick: PICK, date: '2026-10-27', stats: { listeners: 120, comments: 14 }, hot: HOT, tiles: tiles(8, 4), offline: false, actions: acts(), ...p })); });
  mounted.push(r);
  return r;
}
const one = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  const found = r.root.findAll((n) => is(n) && !is(n.parent));
  if (found.length !== 1) throw new Error(`${found.length} buttons named "${label}"`);
  return found[0]!;
};
/** What a Text says, nested Texts (the Hot now time is one Text a character) included. */
const say = (n: ReactTestInstance | string | number | null | undefined | unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  const el = n as { props?: { children?: unknown } };
  return say(el.props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));

it('the sizes: the pick is 3 rows, Hot now is 2 rows, a shortcut is 1 row', () => {
  expect([MOSAIC.row, MOSAIC.gap, MOSAIC.radius]).toEqual([84, 10, 22]);
  expect(PICK_HEIGHT).toBe(272);
  expect(HOT_HEIGHT).toBe(178);
  const r = mosaic();
  expect(flat(one(r, 'Hot now: play Hot ep from 14:32. 41 reacting'))['minHeight']).toBe(HOT_HEIGHT);
  expect(flat(one(r, 'T2'))['minHeight']).toBe(MOSAIC.row); // F10: minHeight, the words may grow the tile
});

it("the pick tile: TODAY'S PICK with the date, the title, the note, the counts", () => {
  const w = words(mosaic());
  expect(w).toContain("TODAY'S PICK · OCT 27");
  expect(w).toContain('Why mornings matter');
  expect(w).toContain('“Short, warm, and good with coffee.”');
  expect(w).toContain('120 listened · 14 comments');
  expect(w).toContain('PAST →');
});

it('every old pick action is there under its old name and works', () => {
  const a = acts();
  const r = mosaic({ actions: a });
  act(() => { one(r, 'Past picks').props['onPress'](); });
  expect(a.onPast).toHaveBeenCalled();
  act(() => { one(r, 'Open Why mornings matter').props['onPress'](); });
  expect(a.onOpen).toHaveBeenCalledWith(PICK.episode);
  act(() => { one(r, 'Add Why mornings matter to the queue').props['onPress'](); });
  expect(a.onQueue).toHaveBeenCalledWith(PICK.episode);
  act(() => { one(r, 'Play Why mornings matter').props['onPress'](); });
  expect(a.onPlay).toHaveBeenCalledWith(PICK.episode);
});

it('Hot now plays from the hottest moment; with no moments it is not drawn and the shortcuts take its place', () => {
  const a = acts();
  const r = mosaic({ actions: a });
  expect(words(r)).toEqual(expect.arrayContaining(['HOT NOW', '14:32', '“the part I replay”', '41 reacting']));
  act(() => { one(r, 'Hot now: play Hot ep from 14:32. 41 reacting').props['onPress'](); });
  expect(a.onHot).toHaveBeenCalledWith(HOT);
  const none = mosaic({ hot: undefined });
  expect(words(none)).not.toContain('HOT NOW');
  for (let i = 0; i < 8; i++) expect(one(none, `T${i}`)).toBeTruthy();
});

it('each shortcut is drawn once, whatever the layout, and presses its own action', () => {
  const t = tiles(8, 4);
  const r = mosaic({ tiles: t });
  t.forEach((tile, i) => { act(() => { one(r, `T${i}`).props['onPress'](); }); expect(tile.onPress).toHaveBeenCalledTimes(1); });
});

it('an odd number of shortcuts keeps the last cell empty (it does not stretch)', () => {
  expect(pairs([1, 2, 3])).toEqual([[1, 2], [3, null]]);
  expect(pairs([])).toEqual([]);
  const r = mosaic({ hot: undefined, tiles: tiles(3) });
  const last = one(r, 'T2');
  expect(flat(last)['flexGrow']).toBeUndefined();
  let row: ReactTestInstance | null = last.parent;
  while (row !== null && !(typeof row.type === 'string' && row.children.length > 1)) row = row.parent;
  expect(row!.children).toHaveLength(2);
});

it('offline with nothing cached: one dashed tile says so; the shortcuts still work', () => {
  const t = tiles(4);
  const r = mosaic({ offline: true, pick: undefined, hot: undefined, tiles: t });
  const w = words(r);
  expect(w).toContain("Couldn't reach the server, and nothing is cached yet.");
  expect(w).toContain('Pull down to try again.');
  expect(w).not.toContain('HOT NOW');
  act(() => { one(r, 'T3').props['onPress'](); });
  expect(t[3]!.onPress).toHaveBeenCalled();
});

it('no pick today: the shortcuts and Hot now still draw', () => {
  const r = mosaic({ pick: undefined });
  expect(words(r)).not.toContain('PAST →');
  expect(words(r)).toContain('HOT NOW');
});
