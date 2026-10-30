// Tests M24 lane A3's pages: Wallet opens Redeem, Account opens Change email, Downloads chooses several and deletes them.
/**
 * The rendered half of __tests__/m24-account.test.ts (the helpers are tested there). Each page is
 * rendered with its hooks stubbed: Wallet's "Redeem a code" row pushes /redeem; Account and
 * security's "Change" pushes /settings/account-email; Downloads' "Select" turns into "Done", the
 * rows become ticks, and "Delete N episodes" asks once and then removes each chosen row through
 * the download manager. On a phone, all three are NOT VERIFIED here.
 *
 * The break that turns it red: in app/downloads.tsx call `removeChosen(list, () => Promise.resolve())`
 * (nothing removed), or drop the Select button — the Downloads test fails.
 */
// The confirm sheet animates from timers; fake ones keep them inside the test (see sheets.test.tsx).
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { DownloadRow } from '@/storage/types';

const mockPush = jest.fn();
const mockToast = jest.fn();
const row = (episodeId: string): DownloadRow => ({ episodeId, filePath: `file:///d/${episodeId}.mp3`, state: 'complete', bytesDone: 1000, bytesTotal: 1000, allowMobile: false, requestedAt: 0 });
let mockRows: DownloadRow[] = [];
const mockDownloads = {
  subscribe: () => () => undefined,
  usedBytes: () => 2000,
  budgetBytes: () => 500 * 1024 ** 2,
  allowMobile: () => false,
  setAllowMobile: jest.fn(),
  setBudgetBytes: jest.fn(),
  removeFinished: jest.fn(),
  request: jest.fn(),
  cancel: jest.fn(),
  remove: jest.fn((_id: string) => Promise.resolve()),
};
// One object per run, as the real providers give.
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  downloads: { list: () => mockRows },
  feeds: { getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: `Episode ${id}` }), getShow: () => undefined },
};
const mockSocial = { api: { me: () => new Promise(() => undefined) }, listener: { listenerId: 'me', displayName: 'Ana', email: 'ana@example.com' } };
const mockM12 = { purchases: () => new Promise(() => undefined) };
const mockPlay = { granted: 0, error: undefined };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useDownloads: () => mockDownloads, useToast: () => mockToast }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/billing/play', () => ({ usePlayStore: () => mockPlay }));
jest.mock('@/billing/purchase-api', () => ({ usePurchaseApi: () => ({}) }));
jest.mock('@/ui/me/PlusCard', () => ({ PlusCard: () => null }));
// Only `mb` is used from here; the real file pulls in the queue.
jest.mock('@/ui/episode/DownloadButton', () => ({ mb: (b?: number) => `${b ?? 0} B` }));

import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import WalletScreen from '../app/wallet';
import AccountSecurityScreen from '../app/settings/account';
import DownloadsScreen from '../app/downloads';

const rendered: ReactTestRenderer[] = [];
async function render(page: () => React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(GluestackUIProvider, null, createElement(page))); });
  rendered.push(r);
  return r;
}
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockPush.mockClear(); mockToast.mockClear(); mockDownloads.remove.mockClear(); });

const labelled = (r: ReactTestRenderer, label: string): ReactTestInstance[] =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = async (r: ReactTestRenderer, label: string) => {
  const n = labelled(r, label)[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); });
};
/** Lets a chain of awaits (one per removed row) settle. */
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };

it('Wallet: "Redeem a code" opens the Redeem page', async () => {
  const r = await render(WalletScreen);
  await press(r, 'Redeem a code');
  expect(mockPush).toHaveBeenCalledWith('/redeem');
});

it('Account and security: "Change" opens the Change email page', async () => {
  const r = await render(AccountSecurityScreen);
  await press(r, 'Change email');
  expect(mockPush).toHaveBeenCalledWith('/settings/account-email');
});

describe('Downloads: Select mode', () => {
  it('Select → Done; choose two rows; "Delete 2 episodes" asks once, then removes each', async () => {
    mockRows = [row('a'), row('b'), row('c')];
    const r = await render(DownloadsScreen);
    expect(labelled(r, 'Done')).toHaveLength(0);
    await press(r, 'Select');
    expect(labelled(r, 'Select')).toHaveLength(0);
    expect(labelled(r, 'Done')).not.toHaveLength(0);

    // Nothing chosen: the Delete button has no press.
    expect(labelled(r, 'Delete')).toHaveLength(0);
    await press(r, 'Select Episode a');
    await press(r, 'Select Episode b');
    await press(r, 'Delete 2 episodes');
    // The question comes first; nothing is removed until it is answered.
    expect(mockDownloads.remove).not.toHaveBeenCalled();
    await press(r, 'Delete');
    await flush();
    expect(mockDownloads.remove.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    expect(mockToast).toHaveBeenCalledWith('2 downloads deleted.');
    // Done deleting: Select mode ends.
    expect(labelled(r, 'Select')).not.toHaveLength(0);
  });

  it('"Done" leaves Select mode without deleting', async () => {
    mockRows = [row('a')];
    const r = await render(DownloadsScreen);
    await press(r, 'Select');
    await press(r, 'Select Episode a');
    await press(r, 'Done');
    expect(labelled(r, 'Select')).not.toHaveLength(0);
    expect(mockDownloads.remove).not.toHaveBeenCalled();
  });
});
