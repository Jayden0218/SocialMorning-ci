// Tests that the Downloads page matches its drawings in the numbers the owner compared.
/**
 * M31 W3-B (T041; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/listen.html `downloads--screen`, `-empty`, `-settings`, `-select-mode`, `-delete-dialog`, `toast--downloads`
 * and `dlTile`. Each test names the revert that turns it red (each was seen red once, then restored):
 *  - tiles 1 x 2: (390 - 28 - 16 - 10) / 2 = 168 wide, 178 tall, radius 22, padding 14: `DOWNLOAD_TILE.height` / `lane` / `right` — red;
 *  - three groups named by an edge label, only the ones that have tiles: `kindOf` — red;
 *  - the states read "Downloading · 42 %", "Paused · 10 %", "Waiting", "Failed · network lost", "Not enough space", "Downloaded · 46 MB": `state()` — red;
 *  - a failed tile has a Retry pill (32 tall, a 48 target) and hot-text state words; a finished one a green check ring: `kindOf` / `DownloadRing` — red;
 *  - the ring: hot to violet running, white at 40 % paused, full with a check when done: `arc` in DownloadRing — red;
 *  - tap = the episode, long-press = Remove (finished, failed) or Cancel (running): swap the menu's branches — red;
 *  - the gear opens the panel (six budget chips, the chosen one light), becomes a ×; Select makes "n selected" with the action bar — red if
 *    the title or the bar are not swapped.
 * NOT VERIFIED: anything seen on a phone; the slide of the panel.
 */
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { DownloadRow } from '@/storage/types';
import { colour } from '@/design';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mk = (episodeId: string, state: DownloadRow['state'], extra: Partial<DownloadRow> = {}): DownloadRow => ({ episodeId, filePath: `file:///d/${episodeId}.mp3`, state, bytesDone: 1000, bytesTotal: 1000, allowMobile: false, requestedAt: 0, ...extra });
let mockRows: DownloadRow[] = [];
let mockBudget = 1e9;
let mockUsed = 151 * 1_000_000;
const mockDownloads = {
  subscribe: () => () => undefined,
  usedBytes: () => mockUsed,
  budgetBytes: () => mockBudget,
  allowMobile: () => false,
  setAllowMobile: jest.fn(),
  setBudgetBytes: jest.fn(),
  removeFinished: jest.fn(),
  request: jest.fn(),
  cancel: jest.fn(),
  remove: jest.fn((_id: string) => Promise.resolve()),
};
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  downloads: { list: () => mockRows },
  feeds: { getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: `Episode ${id}` }), getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Night Shift Radio' }) },
};
jest.mock('expo-router', () => ({
  usePathname: () => '/downloads',
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useDownloads: () => mockDownloads, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/episode/DownloadButton', () => ({ mb: (b?: number) => (b === undefined ? '' : b <= 0 ? '0 MB' : `${Math.round(b / 1e6) || 46} MB`) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import DownloadsScreen from '../app/downloads';
import { DownloadRing, ringFraction } from '@/ui/downloads/DownloadRing';
import { DOWNLOAD_TILE, DOWNLOADS_PAGE } from '@/ui/downloads/measures';
import { kindOf } from '@/ui/downloads/DownloadTile';

const rendered: ReactTestRenderer[] = [];
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockPush.mockClear(); mockToast.mockClear(); for (const f of [mockDownloads.remove, mockDownloads.cancel, mockDownloads.request, mockDownloads.removeFinished, mockDownloads.setBudgetBytes]) f.mockClear(); mockBudget = 1e9; mockUsed = 151 * 1_000_000; });
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); act(() => { n.props['onPress'](); }); };
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const hostOf = (n: ReactTestInstance) => n.findAll((x) => typeof x.type === 'string')[0]!;
const tiles = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['testID'] === 'download-tile' && typeof n.type === 'string');
const page = () => render(createElement(DownloadsScreen));
const sample = () => [
  mk('r', 'downloading', { bytesDone: 420, bytesTotal: 1000 }),
  mk('p', 'paused', { bytesDone: 100, bytesTotal: 1000 }),
  mk('w', 'waiting', { bytesDone: 0 }),
  mk('s', 'failed', { error: 'budget' }),
  mk('f', 'failed', { error: 'network lost' }),
  mk('d', 'complete'),
];

describe('the mosaic (downloads--screen)', () => {
  it('tiles are 1 x 2: 168 wide, 178 tall, radius 22, in a 28-lane / 16-right / 10-gap grid', () => {
    mockRows = sample();
    const r = page();
    const t = tiles(r);
    expect(t).toHaveLength(6);
    for (const n of t) {
      expect(flat(n)['width']).toBe((390 - DOWNLOAD_TILE.lane - DOWNLOAD_TILE.right - DOWNLOAD_TILE.gap) / 2);
      expect(flat(n)['height']).toBe(178);
      expect(flat(n)['borderRadius']).toBe(22);
    }
    expect(DOWNLOAD_TILE).toMatchObject({ lane: 28, right: 16, gap: 10, height: 178, pad: 14, cover: 56, retry: 32 });
  });

  it('three groups, named by an edge label: In progress, Needs attention, Downloaded', () => {
    mockRows = sample();
    const r = page();
    const heads = r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && typeof n.props['accessibilityLabel'] === 'string' && typeof n.type === 'string').map((n) => n.props['accessibilityLabel']);
    expect(heads).toEqual(expect.arrayContaining(['In progress', 'Needs attention', 'Downloaded']));
  });

  it('a group with no tiles is not drawn', () => {
    mockRows = [mk('d', 'complete')];
    const r = page();
    const heads = r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && typeof n.type === 'string').map((n) => n.props['accessibilityLabel']);
    expect(heads).toContain('Downloaded');
    expect(heads).not.toContain('In progress');
    expect(heads).not.toContain('Needs attention');
  });

  it('kindOf puts waiting / downloading / paused in progress, failed in attention, complete in done', () => {
    expect(['waiting', 'downloading', 'paused'].map((s) => kindOf({ state: s as DownloadRow['state'] }))).toEqual(['progress', 'progress', 'progress']);
    expect(kindOf({ state: 'failed' })).toBe('attention');
    expect(kindOf({ state: 'complete' })).toBe('done');
  });

  it('the states are written as drawn', () => {
    mockRows = sample();
    const t = texts(page());
    for (const line of ['Downloading · 42 %', 'Paused · 10 %', 'Waiting', 'Not enough space', 'Failed · network lost', 'Downloaded · 46 MB']) expect(t).toContain(line);
  });

  it('the subtitle counts the tiles and the budget: "6 episodes · 151 MB of 1 GB"; the title bar has the gear and Select', () => {
    mockRows = sample();
    const r = page();
    expect(texts(r)).toContain('6 episodes · 151 MB of 1 GB');
    expect(byLabel(r, 'Download settings').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Select').length).toBeGreaterThan(0);
  });

  it('a failed tile has a Retry pill (32 tall, a 48 target) that retries; a running one has none', () => {
    mockRows = [mk('f', 'failed', { error: 'network lost' }), mk('r', 'downloading', { bytesDone: 1, bytesTotal: 2 })];
    const r = page();
    const retry = byLabel(r, 'Retry');
    expect(retry.length).toBeGreaterThan(0);
    expect(flat(hostOf(retry[0]!))['height']).toBe(32);
    expect(retry[0]!.props['hitSlop']).toBe(8);
    act(() => { retry[0]!.props['onPress'](); });
    expect(mockDownloads.request).toHaveBeenCalledTimes(1);
    expect(mockDownloads.request).toHaveBeenCalledWith('f');
  });

  it('a tap opens the episode; a long-press on a finished tile offers Remove, on a running one Cancel', () => {
    mockRows = [mk('d', 'complete'), mk('r', 'downloading', { bytesDone: 1, bytesTotal: 2 }), mk('f', 'failed', { error: 'x' })];
    const r = page();
    const open = byLabel(r, 'Open Episode d, Downloaded · 46 MB')[0]!;
    act(() => { open.props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'd' } });
    expect(open.props['accessibilityHint']).toBe('Long-press for Remove or Cancel');
    act(() => { open.props['onLongPress'](); });
    expect(byLabel(r, 'Remove').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Cancel')).toHaveLength(0);
    press(r, 'Remove');
    expect(mockDownloads.remove).toHaveBeenCalledWith('d');
    const running = byLabel(r, 'Open Episode r, Downloading · 50 %')[0]!;
    act(() => { running.props['onLongPress'](); });
    expect(byLabel(r, 'Remove')).toHaveLength(0);
    press(r, 'Cancel');
    expect(mockDownloads.cancel).toHaveBeenCalledWith('r');
  });
});

describe('the ring', () => {
  const arcs = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props['strokeDasharray'] === 'string');
  it('fractions: running follows the percent, done is full, paused keeps its place', () => {
    expect(ringFraction('running', 42)).toBeCloseTo(0.42);
    expect(ringFraction('paused', 10)).toBeCloseTo(0.1);
    expect(ringFraction('done', undefined)).toBe(1);
    expect(ringFraction('running', 250)).toBe(1);
    expect(ringFraction('running', undefined)).toBe(0);
  });
  it('running is the gradient, paused is white at 40 %, done is full with a check', () => {
    const run = render(createElement(DownloadRing, { state: 'running', percent: 42 }));
    expect(String(arcs(run)[0]!.props['stroke'])).toMatch(/^url\(#/);
    const paused = render(createElement(DownloadRing, { state: 'paused', percent: 10 }));
    expect(arcs(paused)[0]!.props['stroke']).toBe(colour.barIdle);
    const done = render(createElement(DownloadRing, { state: 'done' }));
    const d = arcs(done)[0]!;
    const [len, circ] = String(d.props['strokeDasharray']).split(' ').map(Number);
    expect(len).toBeCloseTo(circ!, 0);
    expect(done.root.findAll((n) => n.props['name'] === 'checkmark' && n.props['color'] === colour.ok).length).toBeGreaterThan(0);
  });
  it('is 40 with a 4 stroke, and hidden from a screen reader (the tile says it in words)', () => {
    const run = render(createElement(DownloadRing, { state: 'running', percent: 42 }));
    const host = run.root.findAll((n) => n.props['testID'] === 'download-ring' && typeof n.type === 'string')[0]!;
    expect(flat(host)['width']).toBe(40);
    expect(host.props['accessible']).toBe(false);
    expect(arcs(run)[0]!.props['strokeWidth']).toBe(4);
  });
});

describe('the settings panel (downloads--settings)', () => {
  it('the gear opens it: Allow mobile data, the budget ring and six chips with the chosen one light, Remove finished downloads; the gear becomes a ×', () => {
    mockRows = [mk('d', 'complete')];
    const r = page();
    press(r, 'Download settings');
    expect(byLabel(r, 'Hide download settings').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Download settings')).toHaveLength(0);
    const t = texts(r);
    expect(t).toContain('Allow mobile data');
    expect(t).toContain('Budget');
    expect(t).toContain('15%');
    const chips = ['200 MB', '500 MB', '1 GB', '2 GB', '4 GB', '8 GB'].map((l) => byLabel(r, l)[0]);
    expect(chips.every(Boolean)).toBe(true);
    expect(chips.map((c) => c!.props['accessibilityState']?.selected)).toEqual([false, false, true, false, false, false]);
    act(() => { chips[3]!.props['onPress'](); });
    expect(mockDownloads.setBudgetBytes).toHaveBeenCalledWith(2e9);
    press(r, 'Remove finished downloads');
    expect(mockDownloads.removeFinished).toHaveBeenCalledTimes(1);
    press(r, 'Hide download settings');
    expect(byLabel(r, 'Download settings').length).toBeGreaterThan(0);
  });
  it('the budget chips are 3 across with a 8 gap and 48 targets', () => {
    expect(DOWNLOADS_PAGE.chipGap).toBe(8);
    mockRows = [mk('d', 'complete')];
    const r = page();
    press(r, 'Download settings');
    const chip = hostOf(byLabel(r, '1 GB')[0]!);
    expect(flat(chip)['flexBasis']).toBe('30%');
    expect(flat(chip)['minHeight']).toBe(48);
  });
});

describe('empty and select', () => {
  it('empty: "0 of 1 GB", the empty block, the gear stays, Select is hidden', () => {
    mockRows = [];
    mockUsed = 0;
    const r = page();
    expect(texts(r)).toContain('0 of 1 GB');
    expect(texts(r)).toContain('Nothing downloaded yet.');
    expect(byLabel(r, 'Download settings').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Select')).toHaveLength(0);
  });
  it('Select: the title reads "2 selected", the back circle goes, the bar offers Select all / Delete 2 episodes / Done; the tick is 24', () => {
    mockRows = [mk('a', 'complete'), mk('b', 'complete'), mk('c', 'complete')];
    const r = page();
    press(r, 'Select');
    press(r, 'Select Episode a');
    press(r, 'Select Episode b');
    const t = texts(r);
    expect(t).toContain('2 selected');
    expect(byLabel(r, 'Back')).toHaveLength(0);
    expect(byLabel(r, 'Select all').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Delete 2 episodes').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Done').length).toBeGreaterThan(0);
    const ticks = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 24 && flat(n)['height'] === 24);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.filter((n) => flat(n)['backgroundColor'] === colour.hot)).toHaveLength(2);
    press(r, 'Select all');
    expect(byLabel(r, 'Clear').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Delete 3 episodes').length).toBeGreaterThan(0);
  });
});
