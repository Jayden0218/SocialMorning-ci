// Renders the Listening history screen with real stores: rows, filter, select-and-delete.
/**
 * M32 T060 (review F1). Break to watch red: make `HistoryScreen` throw in render, drop the
 * `finished` filter in `rows`, or make `remove` skip `hideFromHistory`.
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { allText, episode, FEED, mount, press, seededStores } from './support/screen-kit';
import { episodeId } from '@/storage/schema';
import { hash } from './support/screen-kit';

const mockStoresRef: { current: ReturnType<typeof seededStores> } = { current: undefined as never };
const mockToast = jest.fn();
const mockApi = { positionIds: () => Promise.resolve(new Set<string>()), deleteHistory: jest.fn(() => Promise.resolve()) };
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }) };
const mockPlayer = { load: jest.fn() };
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { usePathname: () => '/', useIsFocused: () => true, 
    Link: ({ children }: { children: React.ReactElement }) => children,
    router: { push: jest.fn() },
    useFocusEffect: (f: () => void) => { useEffect(() => f(), [f]); },
  };
});
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStoresRef.current, useToast: () => mockToast }));
jest.mock('@/social/api-m22-library', () => ({ HISTORY_DELETE_MAX: 100, useM22LibraryApi: () => mockApi }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer }));
jest.mock('@/ui/shell/ListDetail', () => ({
  ListDetail: ({ list }: { list: React.ReactElement }) => list,
  EpisodePane: () => null,
  useOpensInPane: () => false,
}));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));

import HistoryScreen from '../app/history';

const NOW = Date.now();
function setup() {
  const eps = [episode('a', 'Why we sleep', NOW), episode('b', 'The long walk', NOW), episode('c', 'Old tape', NOW)];
  const stores = seededStores(eps);
  const id = (g: string) => episodeId(FEED, g, hash);
  stores.positions.save({ episodeId: id('a'), offsetMs: 600_000, finished: false }, NOW - 1_000);
  stores.positions.save({ episodeId: id('b'), offsetMs: 1_800_000, finished: true }, NOW - 2_000);
  stores.positions.save({ episodeId: id('c'), offsetMs: 5_000, finished: false }, NOW - 3 * 24 * 3600 * 1000);
  mockStoresRef.current = stores;
  return { stores, id };
}

it('lists history under day headings with where you stopped', async () => {
  setup();
  const r = await mount(createElement(HistoryScreen));
  const t = allText(r);
  expect(t).toContain('Listening history');
  expect(t).toContain('TODAY');
  expect(t).toContain('EARLIER THIS WEEK');
  expect(t).toContain('Why we sleep');
  expect(t).toContain('Old tape');
  expect(t).toContain('Stopped at 10:00');
  expect(t).toContain('Finished');
  expect(t).toContain('The Morning Show');
});

it('"Only finished" keeps only finished episodes', async () => {
  setup();
  const r = await mount(createElement(HistoryScreen));
  const toggle = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Only finished' || (n.props['role'] === 'switch'))[0];
  expect(toggle).toBeDefined();
  await act(async () => { (toggle!.props['onPress'] ?? toggle!.props['onValueChange'])(true); });
  const t = allText(r);
  expect(t).toContain('The long walk');
  expect(t).not.toContain('Why we sleep');
});

it('Select, tick one row, Delete (1) removes it from the list and says so', async () => {
  setup();
  mockApi.deleteHistory.mockClear();
  mockToast.mockClear();
  const r = await mount(createElement(HistoryScreen));
  await press(r, 'Select');
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Delete (0)' && n.props['disabled'] === true).length).toBeGreaterThan(0);
  await press(r, 'Select Why we sleep');
  await press(r, 'Delete (1)');
  expect(mockToast).toHaveBeenCalledWith('1 item deleted.');
  expect(allText(r)).not.toContain('Why we sleep');
  expect(allText(r)).toContain('The long walk');
});
