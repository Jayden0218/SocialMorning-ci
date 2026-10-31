// M32 T091 (review): five screens read the local database in the render body; an unrelated
// re-render (a toggle, a keystroke, a sheet opening) must not read it again.
/**
 * Break that turns it red: in app/history.tsx, app/moments.tsx, app/downloads.tsx,
 * app/settings/opml.tsx or app/settings/collected.tsx read the store straight in the render
 * body / renderItem again (stores.feeds.getShow, stores.subscriptions.list, listMoments ...).
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { allText, episode, FEED, hash, mount, press, seededStores } from './support/screen-kit';
import { episodeId } from '@/storage/schema';
import { saveMoment } from '@/me/moments';

const mockRef: { stores: ReturnType<typeof seededStores> } = { stores: undefined as never };
const mockToast = jest.fn();
const mockM22 = { positionIds: () => Promise.resolve(new Set<string>()), deleteHistory: jest.fn(() => Promise.resolve()) };
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }) };
const mockPlayer = { load: jest.fn(), seek: jest.fn() };
const mockSocial = { listener: undefined };
const mockSync = { push: jest.fn() };
const mockDl = {
  subscribe: jest.fn(() => () => undefined), usedBytes: () => 0, budgetBytes: () => 500 * 1024 ** 2, allowMobile: () => false,
  setBudgetBytes: jest.fn(), setAllowMobile: jest.fn(), remove: jest.fn(() => Promise.resolve()), cancel: jest.fn(), request: jest.fn(), removeFinished: jest.fn(() => Promise.resolve()),
};
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { usePathname: () => '/', useIsFocused: () => true,  Link: ({ children }: { children: React.ReactElement }) => children, router: { push: jest.fn() }, useFocusEffect: (f: () => void) => { useEffect(() => f(), [f]); } };
});
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => mockToast, useDownloads: () => mockDl, useSubscriptionSync: () => mockSync }));
jest.mock('@/social/api-m22-library', () => ({ HISTORY_DELETE_MAX: 100, useM22LibraryApi: () => mockM22 }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: ({ list }: { list: React.ReactElement }) => list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));
jest.mock('@/ui/kit/confirm', () => ({ useConfirm: () => [jest.fn(), null] }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useSharePanel: () => [jest.fn(), null] }));

import HistoryScreen from '../app/history';
import MomentsScreen from '../app/moments';
import DownloadsScreen from '../app/downloads';
import OpmlScreen from '../app/settings/opml';
import CollectedScreen from '../app/settings/collected';

jest.setTimeout(60_000);
const NOW = Date.now();
const id = (g: string) => episodeId(FEED, g, hash);
function setup() {
  const stores = seededStores([episode('a', 'Why we sleep', NOW), episode('b', 'The long walk', NOW)]);
  stores.positions.save({ episodeId: id('a'), offsetMs: 600_000, finished: false }, NOW - 1_000);
  stores.positions.save({ episodeId: id('b'), offsetMs: 1_000, finished: true }, NOW - 2_000);
  stores.subscriptions.add(FEED, 1);
  stores.downloads.put({ episodeId: id('a'), filePath: '/a', state: 'complete', bytesDone: 5, bytesTotal: 5, allowMobile: false, requestedAt: 1 });
  saveMoment(stores.settings, id('a'), 1000, 'note', 1);
  mockRef.stores = stores;
  return stores;
}
/** Every read the five screens make, counted together. */
function counters(s: ReturnType<typeof seededStores>) {
  const spies = [
    jest.spyOn(s.feeds, 'getShow'), jest.spyOn(s.feeds, 'getEpisode'), jest.spyOn(s.subscriptions, 'list'), jest.spyOn(s.subscriptions, 'has'),
    jest.spyOn(s.positions, 'all'), jest.spyOn(s.auth, 'get'), jest.spyOn(s.settings, 'get'), jest.spyOn(s.downloads, 'list'),
  ];
  return () => spies.reduce((n, sp) => n + sp.mock.calls.length, 0);
}

it('history: toggling the filter does not read the stores again', async () => {
  const s = setup();
  const reads = counters(s);
  const r = await mount(createElement(HistoryScreen));
  expect(allText(r)).toContain('Why we sleep');
  const before = reads();
  const toggle = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Only finished' || n.props['role'] === 'switch')[0]!;
  await act(async () => { (toggle.props['onPress'] ?? toggle.props['onValueChange'])(true); });
  await act(async () => { (toggle.props['onPress'] ?? toggle.props['onValueChange'])(false); });
  expect(reads()).toBe(before);
});

it('moments: opening the note editor does not read the stores again', async () => {
  const s = setup();
  const reads = counters(s);
  const r = await mount(createElement(MomentsScreen));
  expect(allText(r)).toContain('Why we sleep');
  const before = reads();
  await press(r, 'Edit note');
  expect(reads()).toBe(before);
});

it('downloads: opening the settings does not read the stores again', async () => {
  const s = setup();
  const reads = counters(s);
  const r = await mount(createElement(DownloadsScreen));
  expect(allText(r)).toContain('Why we sleep');
  const before = reads();
  await press(r, 'Download settings');
  expect(reads()).toBe(before);
});

it('opml: typing does not re-list the subscriptions', async () => {
  const s = setup();
  const reads = counters(s);
  const r = await mount(createElement(OpmlScreen));
  const before = reads();
  const input = r.root.findAll((n) => n.props['accessibilityLabel'] === 'OPML to import' && typeof n.props['onChangeText'] === 'function')[0]!;
  await act(async () => { input.props['onChangeText']('x'); });
  await act(async () => { input.props['onChangeText']('xy'); });
  expect(reads()).toBe(before);
});

it('collected: opening an item does not count the stores again', async () => {
  const s = setup();
  const reads = counters(s);
  const r = await mount(createElement(CollectedScreen));
  const before = reads();
  const row = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].endsWith('Details') && typeof n.props['onPress'] === 'function')[0]!;
  await act(async () => { row.props['onPress'](); });
  expect(reads()).toBe(before);
});

it('opml: an import still refreshes the subscription count', async () => {
  setup();
  const r = await mount(createElement(OpmlScreen));
  expect(allText(r)).toContain('EXPORT | 1 | subscription |');
  const input = r.root.findAll((n) => n.props['accessibilityLabel'] === 'OPML to import' && typeof n.props['onChangeText'] === 'function')[0]!;
  await act(async () => { input.props['onChangeText']('<opml><body><outline xmlUrl="https://other.example/rss.xml" text="O"/></body></opml>'); });
  await press(r, 'Subscribe to 1');
  expect(allText(r)).toContain('EXPORT | 2 | subscriptions |');
});
