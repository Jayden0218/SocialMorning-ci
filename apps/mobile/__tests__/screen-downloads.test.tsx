// Renders the Downloads screen with real stores: sections, states, a budget chip, Cancel and Retry.
/**
 * M32 T060 (review F1). Break to watch red: throw in `DownloadsScreen`, change `state()` so a
 * failed row no longer says "Not enough space", or wire the Cancel button to `remove`.
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { allText, episode, FEED, hash, mount, press, pressText, seededStores } from './support/screen-kit';
import { episodeId } from '@/storage/schema';

const MB = 1_000_000; // decimal units (M31 F8)
const mockRef: { stores: ReturnType<typeof seededStores> } = { stores: undefined as never };
const mockDl = {
  subscribe: jest.fn(() => () => undefined),
  usedBytes: () => 150 * MB,
  budgetBytes: () => 500 * MB,
  allowMobile: () => false,
  setBudgetBytes: jest.fn(),
  setAllowMobile: jest.fn(),
  remove: jest.fn(() => Promise.resolve()),
  cancel: jest.fn(),
  request: jest.fn(),
  removeFinished: jest.fn(() => Promise.resolve()),
};
const mockToast = jest.fn();
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockRef.stores,
  useDownloads: () => mockDl,
  useToast: () => mockToast,
}));

// The dialog is a portalled sheet; the question the screen asks is what matters here.
const mockAsk = jest.fn();
jest.mock('@/ui/kit/confirm', () => ({ useConfirm: () => [mockAsk, null] }));

import DownloadsScreen from '../app/downloads';

const row = (id: string, state: 'waiting' | 'downloading' | 'complete' | 'failed', extra: object = {}) => ({
  episodeId: id, filePath: `/${id}`, state, bytesDone: 0, allowMobile: false, requestedAt: 1, ...extra,
});

function setup() {
  const stores = seededStores([episode('a', 'Cooking with fire', 1), episode('b', 'Deep sea', 2), episode('c', 'Night trains', 3)]);
  const id = (g: string) => episodeId(FEED, g, hash);
  stores.downloads.put(row(id('a'), 'downloading', { bytesDone: 50 * MB, bytesTotal: 100 * MB }));
  stores.downloads.put(row(id('b'), 'complete', { bytesDone: 80 * MB, bytesTotal: 80 * MB }));
  stores.downloads.put(row(id('c'), 'failed', { error: 'budget' }));
  mockRef.stores = stores;
  return id;
}

it('shows the space used, the three sections and each row\'s state', async () => {
  setup();
  const r = await mount(createElement(DownloadsScreen));
  const t = allText(r);
  expect(t).toContain('Downloads');
  expect(t).toContain('150 MB');
  expect(t).toContain('150 MB of 500 MB');
  expect(t).toContain('IN PROGRESS');
  expect(t).toContain('NEEDS ATTENTION');
  expect(t).toContain('DOWNLOADED');
  expect(t).toContain('Cooking with fire');
  expect(t).toContain('50 %');
  expect(t).toContain('Downloaded · 80 MB');
  expect(t).toContain('Not enough space');
});

it('Cancel stops the running download, Retry asks again, a budget chip sets the budget', async () => {
  const id = setup();
  mockDl.cancel.mockClear(); mockDl.request.mockClear(); mockDl.setBudgetBytes.mockClear();
  const r = await mount(createElement(DownloadsScreen));
  // The tile's Cancel / Remove live in its long-press menu (the Pulse mosaic has no row buttons).
  const tile = r.root.findAll((n) => typeof n.props['onLongPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Open Cooking with fire'))[0]!;
  await act(async () => { (tile.props['onLongPress'] as () => void)(); });
  await pressText(r, 'Cancel');
  expect(mockDl.cancel).toHaveBeenCalledWith(id('a'));
  await pressText(r, 'Retry');
  expect(mockDl.request).toHaveBeenCalledWith(id('c'));
  await press(r, 'Download settings'); // the gear slides the settings panel over the mosaic
  await pressText(r, '1 GB');
  expect(mockDl.setBudgetBytes).toHaveBeenCalledWith(1e9);
});

it('Select, tick a row, Delete asks first, then removes it', async () => {
  const id = setup();
  mockDl.remove.mockClear(); mockAsk.mockClear();
  const r = await mount(createElement(DownloadsScreen));
  await press(r, 'Select');
  await press(r, 'Select Deep sea');
  await press(r, 'Delete 1 episode');
  expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete 1 episode?', action: 'Delete' }));
  expect(mockDl.remove).not.toHaveBeenCalled(); // asked, not yet done
  await act(async () => { (mockAsk.mock.calls[0][0] as { onConfirm: () => void }).onConfirm(); });
  expect(mockDl.remove).toHaveBeenCalledWith(id('b'));
});

it('with nothing downloaded it says so', async () => {
  mockRef.stores = seededStores([]);
  const r = await mount(createElement(DownloadsScreen));
  expect(allText(r)).not.toContain('IN PROGRESS');
  expect(allText(r)).toContain('Nothing downloaded yet.');
});
