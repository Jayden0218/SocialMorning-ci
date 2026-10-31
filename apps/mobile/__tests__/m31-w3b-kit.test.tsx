// Tests the pushed-page frame (PushedPage, PageGlow) and the episode menu's queue tiles against their drawings.
/**
 * M31 W3-B (T041; design-pulse2 `listen.html` `pushed()`, `glow()`, `stile`, `toast--queue-buttons`). Each test names the revert that turns it red
 * (each was seen red once, then restored):
 *  - the title bar sits 6 above the foot (the drawing's 40 less the 34 pt strip the root pads) and 74 with the now bar (108 less 34):
 *    `titleBarBottom` / `pushedLayout` — red; a page outside the root's padding adds its own strip (`safeBottom`);
 *  - back is the default and `onBack={null}` hides it; `tone="none"` draws no glow, `grey` the grey one;
 *  - the content can ask for the measures: the status bar, the title bar's spot and how much room its last row must leave;
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

import { PushedPage, pushedLayout } from '@/ui/kit/PushedPage';
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
const titleBar = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && String(n.props['className'] ?? '').includes('absolute left-0 right-0 gap-gap'))[0]!;

describe('where the bars sit', () => {
  it('the title bar is 6 above the foot, 74 with the now bar; the content leaves room for it', () => {
    expect(pushedLayout(47, false).titleBottom).toBe(6);
    expect(pushedLayout(47, true).titleBottom).toBe(74);
    expect(pushedLayout(47, false).top).toBe(47);
    expect(pushedLayout(47, true).reserve).toBeGreaterThan(pushedLayout(47, false).reserve);
    expect(pushedLayout(47, false, 60).reserve - pushedLayout(47, false).reserve).toBe(60);
  });
  it('a page draws its title bar there, and 74 with the now bar showing', () => {
    const plain = render(createElement(PushedPage, { title: 'Queue' } as React.ComponentProps<typeof PushedPage>, null));
    expect(flat(titleBar(plain))['bottom']).toBe(6);
    mockNow = true;
    const withNow = render(createElement(PushedPage, { title: 'Queue' } as React.ComponentProps<typeof PushedPage>, null));
    expect(flat(titleBar(withNow))['bottom']).toBe(74);
  });
  it('a page outside the root\'s padding (a modal route) adds its own strip and may say there is no now bar', () => {
    mockNow = true;
    const r = render(createElement(PushedPage, { title: 'Voice status', now: false, safeBottom: 34 } as React.ComponentProps<typeof PushedPage>, null));
    expect(flat(titleBar(r))['bottom']).toBe(6 + 34);
  });
  it('back is the default (history back); onBack={null} hides it; backIcon / size / subtitle reach the bar', () => {
    const r = render(createElement(PushedPage, { title: 'Downloads', subtitle: '6 episodes' } as React.ComponentProps<typeof PushedPage>, null));
    act(() => { byLabel(r, 'Back')[0]!.props['onPress'](); });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r.toJSON())).toContain('6 episodes');
    const none = render(createElement(PushedPage, { title: 'x', onBack: null } as React.ComponentProps<typeof PushedPage>, null));
    expect(byLabel(none, 'Back')).toHaveLength(0);
    const close = render(<PushedPage title="x" onBack={jest.fn()} backIcon="close" backLabel="Cancel">{null}</PushedPage>);
    expect(byLabel(close, 'Cancel').length).toBeGreaterThan(0);
  });
  it('the content may ask for the measures', () => {
    let seen: { top: number; titleBottom: number; reserve: number } | undefined;
    render(<PushedPage title="x">{(l: { top: number; titleBottom: number; reserve: number }) => { seen = l; return null; }}</PushedPage>);
    expect(seen).toMatchObject({ top: 47, titleBottom: 6 });
    expect(seen!.reserve).toBeGreaterThan(60);
  });
});

describe('the glow', () => {
  const stops = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props['stopColor'] === 'string').map((n) => n.props['stopColor']);
  it('hot is the brand pair at 32 % from 220 above; grey the drawing\'s #3A3A44 / #24242C at 40 % from 200 above', () => {
    const hot = render(createElement(PageGlow, {}));
    expect(stops(hot)).toEqual(expect.arrayContaining([colour.hot, colour.violet]));
    const svg = hot.root.findAll((n) => n.props['testID'] === 'page-glow')[0]!.findAll((n) => typeof n.type === 'string' && flat(n)['opacity'] !== undefined)[0]!;
    expect(flat(svg)['opacity']).toBe(0.32);
    expect(flat(svg)['top']).toBe(-220);
    const grey = render(createElement(PageGlow, { tone: 'grey' }));
    expect(stops(grey)).toEqual(expect.arrayContaining([colour.glowGrey, colour.line]));
    expect(stops(grey)).not.toContain(colour.hot);
    expect(colour.glowGrey).toBe('#3a3a44');
  });
  it('tone="none" draws none', () => {
    const r = render(createElement(PushedPage, { title: 'x', tone: 'none' } as React.ComponentProps<typeof PushedPage>, null));
    expect(r.root.findAll((n) => n.props['testID'] === 'page-glow')).toHaveLength(0);
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
