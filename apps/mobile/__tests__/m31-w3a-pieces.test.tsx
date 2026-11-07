// Tests the Episode lane's smaller pieces: the stage's words, the notes, the picture viewer, the download tile's states, and Show info.
/**
 * M31 W3-A (T040; design-pulse2 `episode--screen` Notes, `episode--picture-viewer`, `episode--more-sheet` Download states,
 * `show-info--screen`, `-loading`, `-error`, `toast--show-info`). In Jest only; how it looks on a phone is NOT VERIFIED.
 *
 * The breaks that turn it red (each tried once): in stage.ts `hottestMoment` return `atMs: best.peak` (not ms); in ShowNotes
 * make the picture `height: 100`; in PictureViewer drop the `<Fade`; in DownloadButton `downloadTile` return `act: 'request'`
 * for a complete row; in `app/show-info/[feedUrl].tsx` draw the owner tile before the feed tile; in InfoGroup drop the rule.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockToast = jest.fn();
const mockSetString = jest.fn();
let mockInfo: 'pending' | 'failed' | Record<string, unknown> = 'pending';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ feedUrl: encodeURIComponent('https://feeds.example/rss') }),
  usePathname: () => '/show-info/x',
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  return Object.defineProperty(rn, 'Clipboard', { value: { setString: (s: string) => mockSetString(s) } });
});
jest.mock('@/ui/shell/providers', () => {
  const stores = { feeds: { getShow: () => ({ feedUrl: 'https://feeds.example/rss', title: 'Morning Notes' }) }, settings: { get: () => undefined, set: () => undefined } };
  return { useStores: () => stores, useToast: () => mockToast, useDownloads: () => undefined };
});
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => {
  const api = { showInfo: () => (mockInfo === 'pending' ? new Promise(() => undefined) : mockInfo === 'failed' ? Promise.reject(new Error('offline')) : Promise.resolve(mockInfo)) };
  const value = { api };
  return { useSocial: () => value };
});
jest.mock('react-native-zoom-toolkit', () => ({ Gallery: () => null, fitContainer: () => ({ width: 1, height: 1 }), useImageResolution: () => ({ resolution: undefined, error: false }) }));

import ShowInfoScreen, { countryName, ownerRows } from '../app/show-info/[feedUrl]';
import { ShowNotes, noteBlocks } from '@/ui/episode/ShowNotes';
import { PictureViewer } from '@/ui/episode/PictureViewer';
import { downloadTile } from '@/ui/episode/DownloadButton';
import { countsLine, datePill, hottestMoment } from '@/ui/episode/stage';
import { InfoError, InfoGroup } from '@/ui/show/InfoGroup';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { noteParts } from '@/ui/kit/format';
import { player as PLAYER, colour } from '@/design/tokens';

const rendered: ReactTestRenderer[] = [];
async function mount(node: React.ReactElement, insets = { top: 47, bottom: 34, left: 0, right: 0 }): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: insets }, node)); });
  rendered.push(r);
  return r;
}
const hosts = (r: ReactTestRenderer, pred: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && pred(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const n = hosts(r, (x) => x.props['testID'] === id)[0];
  if (!n) throw new Error(`no testID "${id}"`);
  return n;
};
const style = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());
const labels = (r: ReactTestRenderer): string[] => hosts(r, (n) => typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);

beforeEach(() => { jest.useFakeTimers(); setReducedMotionForTest(true); mockToast.mockClear(); mockSetString.mockClear(); mockInfo = 'pending'; });
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 50 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

describe('what the stage says', () => {
  const peak = Array.from({ length: 100 }, (_, i) => (i >= 39 && i <= 43 ? (i === 40 ? 1 : 0.9) : 0.1));

  it('the hottest moment is the peak, in milliseconds on the audio axis, and its bars are the run under it', () => {
    const h = hottestMoment(peak, 600_000, 600_000)!;
    expect(h.atMs).toBe(240_000);
    // 70 bars over 100 buckets: buckets 39–43 sit under bars 27–30.
    expect(h.range[0]).toBeGreaterThanOrEqual(26);
    expect(h.range[1]).toBeLessThanOrEqual(31);
    expect(h.range[1]).toBeGreaterThan(h.range[0]);
  });

  it('a flat curve, no curve, or no length has no hottest moment (the pill is not drawn)', () => {
    expect(hottestMoment(Array.from({ length: 100 }, () => 0.3), 600_000, 600_000)).toBeUndefined();
    expect(hottestMoment(undefined, 600_000, 600_000)).toBeUndefined();
    expect(hottestMoment(peak, undefined, undefined)).toBeUndefined();
  });

  it('a heat axis that differs from the audio is re-cut: the peak moves with it', () => {
    // The server heard 300 s but the audio runs 600 s: the reactions at bucket 40 of 100 are at 120 s of the audio (not 240 s).
    const at = hottestMoment(peak, 300_000, 600_000)!.atMs;
    expect(at).toBeGreaterThan(100_000);
    expect(at).toBeLessThan(130_000);
  });

  it('the date pill and the counts line leave out what they do not know', () => {
    expect(datePill(Date.UTC(2026, 9, 27, 12), 2890_000)).toBe('TUE 27 OCT · 48:10');
    expect(datePill(undefined, 65_000)).toBe('1:05');
    expect(datePill(Date.UTC(2026, 9, 27, 12), undefined)).toBe('TUE 27 OCT');
    expect(datePill(undefined, undefined)).toBeUndefined();
    expect(countsLine({ listeners: 120, comments: 14, clips: 2 })).toBe('120 listened · 14 comments · 2 clips');
    expect(countsLine({ comments: 1, clips: 0 })).toBe('1 comment');
    expect(countsLine({ listeners: 0, comments: 0, clips: 0 })).toBe('');
  });
});

describe('Notes', () => {
  const html = '<p>A short one about the first hour.</p><p>04:12 why it counts</p><p>See <a href="https://x.example">the site</a> and the gem at 1:02:05.</p><p><img src="https://img/a.jpg" alt="the kitchen"></p>';

  it('a chapter line is a chip + words; a mid-line time is a hot-text link; a picture is a 130 tall card with the scan circle', async () => {
    const onPlayFrom = jest.fn();
    const r = await mount(createElement(ShowNotes, { parts: noteParts(html, 7_200_000), onPlayFrom }));
    expect(labels(r)).toContain('Play from 04:12');
    expect(labels(r)).toContain('Play from 1:02:05');
    expect(text(r)).toContain('A short one about the first hour.');
    const link = hosts(r, (n) => n.props['accessibilityLabel'] === 'Play from 1:02:05')[0]!;
    act(() => { link.props['onPress'](); });
    expect(onPlayFrom).toHaveBeenCalledWith(3_725_000);
    // The picture is drawn only once it has loaded; then it is 130 tall with radius 18.
    const pic = () => hosts(r, (n) => n.props['accessibilityRole'] === 'imagebutton')[0]!;
    expect(style(pic())['height']).toBe(1);
    const img = hosts(r, (n) => n.props['resizeMode'] === 'cover')[0]!;
    await act(async () => { img.props['onLoad']({ nativeEvent: { source: { width: 800, height: 600 } } }); });
    expect(style(pic())).toMatchObject({ height: 130, borderRadius: 18 });
    expect(pic().props['accessibilityLabel']).toBe('Picture: the kitchen. Opens full screen');
    // A broken picture leaves nothing.
    await act(async () => { img.props['onError'](); });
    expect(hosts(r, (n) => n.props['accessibilityRole'] === 'imagebutton')).toHaveLength(0);
  });

  it('keeps the blocks the old page had (paragraph, chapter, image)', () => {
    expect(noteBlocks(noteParts(html, 7_200_000)).map((b) => b.kind)).toEqual(['paragraph', 'chapter', 'paragraph', 'image']);
  });
});

describe('the picture viewer', () => {
  it('its bottom zone is Close (44), the count, and Save (48, light) over a 200 tall fade, with the alt text above', async () => {
    const onClose = jest.fn();
    const r = await mount(createElement(PictureViewer, { images: ['https://img/a.jpg', 'https://img/b.jpg'], alts: ['the kitchen', 'the sink'], index: 0, onClose }));
    const all = labels(r);
    for (const l of ['Close the picture', 'Save the picture']) expect(all).toContain(l);
    expect(text(r)).toContain('1 of 2');
    expect(style(hosts(r, (n) => n.props['accessibilityLabel'] === 'Close the picture')[0]!)['width']).toBe(44);
    expect(style(hosts(r, (n) => n.props['accessibilityLabel'] === 'Save the picture')[0]!)['height']).toBe(48);
    expect(r.root.findAll((n) => Array.isArray(n.props['colors']) && style(n)['height'] === 200).length).toBeGreaterThan(0);
    expect(text(r)).toContain('the kitchen');
    act(() => { r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close the picture' && typeof n.props['onPress'] === 'function')[0]!.props['onPress'](); });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the Download tile says its state and does what the state says', () => {
  const row = (state: string, extra: Record<string, unknown> = {}) => ({ episodeId: 'e1', state, bytesDone: 42, bytesTotal: 100, ...extra }) as never;
  it('walks every state of the drawing', () => {
    expect(downloadTile(undefined, false)).toMatchObject({ label: 'Download', detail: 'Wi-Fi only', act: 'request', accessibilityLabel: 'Download this episode' });
    expect(downloadTile(undefined, true).detail).toBeUndefined();
    expect(downloadTile(row('waiting'), false)).toMatchObject({ label: 'Cancel download', detail: 'Waiting…', act: 'cancel', accessibilityLabel: 'Cancel the download' });
    expect(downloadTile(row('downloading'), false).detail).toBe('Downloading · 42 %');
    expect(downloadTile(row('paused'), false).detail).toBe('Paused at 42 %');
    expect(downloadTile(row('complete', { bytesTotal: 82 * 1_000_000 }), false)).toMatchObject({ label: 'Remove download', detail: 'Downloaded · 82 MB', act: 'remove', accessibilityLabel: 'Remove the download' });
    expect(downloadTile(row('failed'), false)).toMatchObject({ label: 'Download', detail: 'Download failed — retry', act: 'request' });
    expect(downloadTile(row('failed', { error: 'budget' }), false).detail).toBe('Not enough space — retry download');
    expect(downloadTile(row('downloading', { error: 'no-resume' }), false).detail).toBe('Downloading · 42 % · restarted');
  });
});

describe('Show info', () => {
  it('the rows of the owner tile follow the kind of show', () => {
    expect(ownerRows({ ownerType: 'feed', ownerCountry: null, claimedAt: null } as never).map((r) => r.title)).toEqual(['Owner']);
    expect(ownerRows({ ownerType: 'claimed', ownerCountry: 'MY', claimedAt: '2026-03-12T00:00:00Z' } as never).map((r) => r.title)).toEqual(['Owner', 'Claimed on', "Owner's IP location"]);
    expect(ownerRows({ ownerType: 'studio', ownerCountry: null, claimedAt: '2025-01-03T00:00:00Z' } as never).map((r) => [r.title, r.detail])).toEqual([
      ['Owner', 'Made in the SocialNet Studio'], ['Made on', expect.stringContaining('2025')], ["Owner's IP location", 'Not known'],
    ]);
    expect(countryName('MY')).toContain('MY');
  });

  it('draws the feed tile at once and the owner tile as a breathing ghost while the lookup is slow', async () => {
    const r = await mount(createElement(ShowInfoScreen));
    expect(text(r)).toContain('https://feeds.example/rss');
    expect(labels(r)).toContain('Copy the feed address');
    expect(byId(r, 'info-ghost')).toBeTruthy();
    expect(hosts(r, (n) => n.props['testID'] === 'info-group')).toHaveLength(1);
    // The title bar is low, with the show's name under the title; the content starts 28 in, 16 from the right.
    expect(text(r)).toContain('Show info');
    expect(text(r)).toContain('Morning Notes');
    expect(style(byId(r, 'show-info-tiles'))).toMatchObject({ marginLeft: 28, marginRight: 16 });
  });

  it('with an answer: two tiles, rows 56 tall at least, a 1 px rule between rows; Copy copies and says so', async () => {
    mockInfo = { ownerType: 'claimed', ownerCountry: 'MY', claimedAt: '2026-03-12T00:00:00Z' };
    const r = await mount(createElement(ShowInfoScreen));
    const groups = hosts(r, (n) => n.props['testID'] === 'info-group');
    expect(groups).toHaveLength(2);
    const rows = hosts(r, (n) => n.props['testID'] === 'info-row');
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(style(row)['minHeight']).toBe(56);
    expect(style(rows[2]!)).toMatchObject({ borderTopWidth: 1, borderTopColor: PLAYER.rowRule });
    expect(style(rows[0]!)['borderTopWidth']).toBeUndefined();
    expect(text(r)).toContain('Claimed by its owner');
    expect(text(r)).toContain('Malaysia');
    const copy = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Copy the feed address' && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { copy.props['onPress'](); });
    expect(mockSetString).toHaveBeenCalledWith('https://feeds.example/rss');
    expect(mockToast).toHaveBeenCalledWith('Feed address copied.');
  });

  it('a failed lookup is an inline error tile with a hot-tinted line; the feed address still works', async () => {
    mockInfo = 'failed';
    const r = await mount(createElement(ShowInfoScreen));
    const err = byId(r, 'info-error');
    expect(style(err)).toMatchObject({ borderWidth: 1, borderColor: '#3a1f28' });
    expect(text(r)).toContain("Couldn't load who owns this show. Check your connection and try again.");
    expect(labels(r)).toContain('Copy the feed address');
  });

  it('InfoGroup and InfoError on their own', async () => {
    const r = await mount(createElement('View', null, createElement(InfoGroup, { rows: [{ icon: 'person-outline', title: 'A', detail: 'one' }, { icon: 'time-outline', title: 'B', detail: 'two' }] }), createElement(InfoError, null, 'No.')));
    expect(hosts(r, (n) => n.props['testID'] === 'info-row')).toHaveLength(2);
    expect(style(byId(r, 'info-group'))['borderRadius']).toBe(20);
    expect(colour.raise).toBe('#111116');
  });
});
