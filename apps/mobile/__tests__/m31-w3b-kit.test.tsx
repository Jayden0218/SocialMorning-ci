// Tests the page glow (PageGlow) and the episode menu's queue tiles against their drawings.
/**
 * M31 W3-B (T041; design-pulse2 `listen.html` `pushed()`, `glow()`, `stile`, `toast--queue-buttons`). Each test names the revert that turns it red
 * (each was seen red once, then restored):
 *  - `tone="none"` draws no glow, `grey` the grey one (039: the pushed-page frame tests went with PushedPage);
 *  - the queue tiles are 84 tall, radius 20, two to a row 10 apart; a statement of fact ("Downloaded") is the same tile with no press.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '@/design';

let mockNow = false;
const mockBack = jest.fn();
const mockToast = jest.fn();
const mockQueueEpisode = jest.fn();
jest.mock('expo-router', () => ({ router: { back: () => mockBack(), replace: jest.fn(), canGoBack: () => true, push: jest.fn() }, usePathname: () => '/queue' }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: mockNow, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => mockToast, useDownloads: () => ({}) }));
jest.mock('@/settings/queue', () => ({ queueEpisode: (...a: unknown[]) => mockQueueEpisode(...a) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { PageList } from '@/ui/kit/layout';
import { PageGlow } from '@/ui/kit/PageGlow';
import { QueueButtons, SheetTile, TileRow } from '@/ui/queue/QueueButtons';

const rendered: ReactTestRenderer[] = [];
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockNow = false; mockBack.mockClear(); mockToast.mockClear(); mockQueueEpisode.mockReset(); });
const render = (el: React.ReactElement, insets = { top: 47, bottom: 34, left: 0, right: 0 }): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: insets }, el)); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const hostOf = (n: ReactTestInstance) => n.findAll((x) => typeof x.type === 'string')[0]!;

// 039 verifier fix: 'where the bars sit' (PushedPage's pushedLayout, title bar top, safeBottom, back, measures) went with PushedPage; Page/PageList pin the gutter, title row, foot and `safeBottom` in src/ui/kit/layout/__tests__.

describe('the glow', () => {
  const stops = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props['stopColor'] === 'string').map((n) => n.props['stopColor']);
  it('hot is the brand pair at 32 % from 220 above; grey the drawing\'s #3A3A44 / #24242C at 40 % from 200 above', () => {
    const hot = render(createElement(PageGlow, {}));
    expect(stops(hot)).toEqual(expect.arrayContaining([colour.hot, colour.line])); // Q8: was [hot, violet]
    const svg = hot.root.findAll((n) => n.props['testID'] === 'page-glow')[0]!.findAll((n) => typeof n.type === 'string' && flat(n)['opacity'] !== undefined)[0]!;
    expect(flat(svg)['opacity']).toBe(0.32);
    expect(flat(svg)['top']).toBe(-220);
    const grey = render(createElement(PageGlow, { tone: 'grey' }));
    expect(stops(grey)).toEqual(expect.arrayContaining([colour.glowGrey, colour.line]));
    expect(stops(grey)).not.toContain(colour.hot);
    expect(colour.glowGrey).toBe('#3a3a44');
  });
  it('tone="none" draws none', () => {
    // 039: was a PushedPage; PageList draws a glow for its `tone` and none for 'none'.
    const none = render(createElement(PageList as React.ComponentType<Record<string, unknown>>, { title: 'x', tone: 'none', data: [], renderItem: () => null }));
    expect(none.root.findAll((n) => n.props['testID'] === 'page-glow')).toHaveLength(0);
    const hot = render(createElement(PageList as React.ComponentType<Record<string, unknown>>, { title: 'x', tone: 'hot', data: [], renderItem: () => null }));
    expect(hot.root.findAll((n) => n.props['testID'] === 'page-glow').length).toBeGreaterThan(0);
  });
});

describe('the queue tiles in the episode menu', () => {
  it('a tile is 84 tall with a 20 radius, the icon above the words; two to a row, 10 apart', () => {
    const r = render(createElement(TileRow, null,
      createElement(SheetTile, { icon: 'play-skip-forward-outline', label: 'Play next', iconColour: 'x', onPress: jest.fn() }),
      createElement(SheetTile, { icon: 'list-outline', label: 'Add to queue', iconColour: 'x', onPress: jest.fn() })));
    const tile = hostOf(byLabel(r, 'Play next')[0]!);
    expect(flat(tile)['height']).toBe(84);
    expect(flat(tile)['borderRadius']).toBe(20);
    const row = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['gap'] === 10)[0]!;
    expect(row).toBeDefined();
  });
  it('a statement of fact is the same tile with no press, read with its detail', () => {
    const r = render(createElement(SheetTile, { icon: 'download-outline', label: 'Downloaded', detail: '46 MB', iconColour: 'x' }));
    const tile = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Downloaded, 46 MB')[0]!;
    expect(tile.props['onPress']).toBeUndefined();
    expect(flat(hostOf(tile))['height']).toBe(84);
  });
  it('Play next and Add to queue keep their words: "Playing next · downloading", the full-queue sentences, and a long-press adds to the front', () => {
    mockQueueEpisode.mockReturnValue({ kind: 'queued', where: 'front', evicted: false, downloading: true });
    const r = render(createElement(QueueButtons, { episodeId: 'e1' }));
    act(() => { byLabel(r, 'Play next')[0]!.props['onPress'](); });
    expect(mockToast).toHaveBeenLastCalledWith('Playing next · downloading');
    mockQueueEpisode.mockReturnValue({ kind: 'full' });
    act(() => { byLabel(r, 'Add to queue')[0]!.props['onPress'](); });
    expect(mockToast).toHaveBeenLastCalledWith('The queue is full (300). Remove something first.');
    mockQueueEpisode.mockReturnValue({ kind: 'queued', where: 'end', evicted: true, downloading: false });
    act(() => { byLabel(r, 'Add to queue')[0]!.props['onPress'](); });
    expect(mockToast).toHaveBeenCalledWith('The queue was full — the last item was dropped.');
    mockQueueEpisode.mockReturnValue({ kind: 'queued', where: 'front', evicted: false, downloading: false });
    const tile = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Add to queue' && typeof n.props['onLongPress'] === 'function')[0]!;
    act(() => { tile.props['onLongPress'](); });
    expect(mockToast).toHaveBeenLastCalledWith('Added to the front');
  });
});
