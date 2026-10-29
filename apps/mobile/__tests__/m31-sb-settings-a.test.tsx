// Tests that the Settings parts and Network, Not interested, Playlist backups, Import or export, Third-party sharing and Widgets match their drawings.
/**
 * M31 S-B (T060 part 2; owner: "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2 `settings.html` (the helpers `page`, `sec`, `tile`, `row`, `group`, `big`, `networkPage`, `notIntPage`,
 * `opmlPage`, `backupsPage`, `sharingPage`, `widgetsPage`) and kit.js / kit.css. Each test names the revert that turns it red (each was seen red once,
 * then restored):
 *  - the parts: a row is 60 tall with 13 / 16 of padding and 12 between its parts; a large tile is 112, radius 22, warm fill and a hot ring when on;
 *    a quiet pill reaches 48 to touch; the page's body is 14 under the status bar, 28 in, 16 from the right: `SET.rowMin`, `SET.bigMin`,
 *    `settingsColour.wash`, `SET.top` changed — red;
 *  - Network: three rows with grey dots before a check, green or hot after, the buttons under the title: `colour.glowGrey` / `colour.ok` swapped — red;
 *  - Not interested: rows with the kind over the name and a Restore pill; the empty block; signed out is a tile: the `EndOfList` / `Hidden` label dropped — red;
 *  - Playlist backups: a 2-wide spine and a dot per version, the newest hot: `SET.spineWidth` / the `i === 0` test changed — red;
 *  - Import or export: the count at 56, step dots 28, the found line: `SET_TYPE.stat` / `SET.stepDot` changed — red;
 *  - Third-party sharing: a lead tile and one tile per party, each read as one sentence: the `accessibilityLabel` dropped — red;
 *  - Widgets: drawings 120 x 60 and 60 x 60, hot squares for art: `SET.widgetWide` changed — red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockShare = jest.fn();
const mockRestore = jest.fn(() => Promise.resolve());
const mockRestoreFn = jest.fn();
const mockRestoreItem = jest.fn();
let mockListener: unknown = { listenerId: 'me', displayName: 'Mei Lin' };
let mockSubs: { feedUrl: string }[] = [];
let mockBackups: unknown[] = [];
let mockDismissals: { items: unknown[]; loaded: boolean; restore: jest.Mock } = { items: [], loaded: true, restore: jest.fn(() => Promise.resolve()) };
const mockSettings = { get: () => undefined, set: () => undefined };
const mockStores = {
  settings: mockSettings,
  subscriptions: { list: () => mockSubs, has: () => false, add: jest.fn() },
  feeds: { getShow: () => undefined, getEpisode: (id: string) => (id === 'e1' ? { title: 'Why mornings matter' } : undefined), listEpisodes: () => [{ enclosureUrl: 'https://cdn.example-audio.com/a.mp3' }] },
  queueBackups: { list: () => mockBackups },
};
const mockQueueSync = { restore: (...a: unknown[]) => { mockRestoreItem(...a); return mockRestore(); } };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/settings/network',
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockStores,
  useToast: () => mockToast,
  useSubscriptionSync: () => ({ push: jest.fn() }),
  useQueueSync: () => mockQueueSync,
}));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: mockListener }) }));
jest.mock('@/recs/dismissals', () => ({ useDismissals: () => mockDismissals }));
jest.mock('@/playback/store', () => ({ usePlayer: () => ({}), usePlayerSelector: () => undefined, selectEpisodeId: () => undefined, selectIdle: () => true }));
jest.mock('@/social/base-url', () => ({ apiBaseUrl: () => 'https://api.example' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useSharePanel: () => [(...a: unknown[]) => mockShare(...a), null] }));
jest.mock('@/ui/shell/startupExtras', () => ({ RELEASES_LATEST: 'https://api.example/releases', isNewer: () => false, parseRelease: () => undefined }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: 'cache' } }));
jest.mock('@/config/store', () => ({ useSectionTitle: (t: string) => t }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }), { virtual: true });

import { colour } from '@/design';
import { settingsColour } from '@/design/tokens';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { BigSwitch, LinkRow, QuietPill, SwitchRow, Row } from '@/ui/settings/panel';
import { SET } from '@/ui/settings/measures';
import NetworkScreen from '../app/settings/network';
import NotInterestedScreen from '../app/settings/not-interested';
import QueueBackupsScreen from '../app/settings/queue-backups';
import OpmlScreen from '../app/settings/opml';
import SharingScreen from '../app/settings/sharing';
import WidgetsScreen from '../app/settings/widgets';
import UpdatesScreen from '../app/settings/updates';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockShare, mockRestore, mockRestoreItem].forEach((m) => m.mockClear());
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockSubs = [];
  mockBackups = [];
  mockDismissals = { items: [], loaded: true, restore: jest.fn(() => Promise.resolve()) };
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(GluestackUIProvider, null, el)); await Promise.resolve(); await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 8; i++) await Promise.resolve(); });
};

describe('the Settings parts (settings.html `row`, `group`, `big`, `page`)', () => {
  it('a switch row is 60 tall, 13 / 16 of padding, 12 between icon, words and switch', async () => {
    const r = await render(createElement(SwitchRow, { icon: 'time-outline', label: 'Queue adds to the end', line: 'The line', value: true, onChange: jest.fn() }));
    const row = hosts(r, (n) => flat(n)['minHeight'] === SET.rowMin)[0]!;
    expect(row).toBeDefined();
    expect(flat(row)).toMatchObject({ minHeight: 60, paddingVertical: 13, paddingHorizontal: 16, gap: 12 });
  });
  it('a plain display row has the same frame', async () => {
    const r = await render(createElement(Row, { label: 'Owner', line: 'x' }));
    expect(hosts(r, (n) => flat(n)['minHeight'] === 60)).toHaveLength(1);
  });
  it('a link row opens its page and never reaches under 48', async () => {
    const r = await render(createElement(LinkRow, { href: '/settings/queue-backups', icon: 'time-outline', label: 'Playlist backups', line: 'The last 10' }));
    const link = r.root.findAll((n) => n.props['accessibilityRole'] === 'link')[0]!;
    expect(link.props['accessibilityLabel']).toBe('Playlist backups, The last 10');
    expect(flat(link)['minHeight']).toBeGreaterThanOrEqual(48);
  });
  it('a large tile is 112 tall, radius 22; on it is the warm fill with a hot ring and a hot-text state', async () => {
    const onR = await render(createElement(BigSwitch, { icon: 'musical-notes-outline', label: 'Music mode', state: 'On · pitch follows speed', on: true, onChange: jest.fn(), testID: 'big' }));
    const on = flat(byId(onR, 'big')[0]);
    expect(on).toMatchObject({ minHeight: 112, borderRadius: 22, padding: 14, backgroundColor: settingsColour.wash, borderColor: settingsColour.ring, borderWidth: 1 });
    const stateOn = hosts(onR, (n) => say(n.props['children']) === 'On · pitch follows speed')[0]!;
    expect(String(stateOn.props['className'])).toContain('text-hotText');
    const offR = await render(createElement(BigSwitch, { icon: 'musical-notes-outline', label: 'Music mode', state: 'Off', on: false, onChange: jest.fn(), testID: 'big2' }));
    const off = flat(byId(offR, 'big2')[0]);
    expect(off['backgroundColor']).toBe(colour.raise);
    expect(off['borderWidth']).toBeUndefined();
  });
  it('a dimmed tile is at 45 % and its switch is off the table', async () => {
    const r = await render(createElement(BigSwitch, { icon: 'mic-outline', label: 'Voice boost', state: 'x', on: false, dim: true, disabled: true, onChange: jest.fn(), testID: 'dim' }));
    expect(flat(byId(r, 'dim')[0])['opacity']).toBe(0.45);
    expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'switch')[0]!.props['accessibilityState']).toMatchObject({ disabled: true });
  });
  it('a quiet pill is the drawn height and reaches 48 to touch', async () => {
    const r = await render(createElement(QuietPill, { label: 'Restore', height: 36, onPress: jest.fn() }));
    const p = r.root.findAll((n) => n.props['accessibilityRole'] === 'button')[0]!;
    expect(flat(p)).toMatchObject({ height: 36, paddingHorizontal: 14, backgroundColor: colour.raise2 });
    expect(p.props['hitSlop']).toEqual({ top: 6, bottom: 6 });
  });
});

describe('the page body (settings.html `page`)', () => {
  it('starts 14 under the status bar, 28 in for the edge-label lane, 16 from the right, blocks 12 apart', async () => {
    const r = await render(createElement(WidgetsScreen));
    const scroll = byId(r, 'settings-scroll')[0]!;
    const c = StyleSheet.flatten(scroll.props['contentContainerStyle'] as never) as Record<string, unknown>;
    expect(c).toMatchObject({ paddingTop: 14, paddingRight: 16, paddingLeft: 0, gap: 12 });
    const section = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['paddingLeft'] === 28)[0];
    expect(section).toBeDefined();
  });
  it('a page without edge labels (Playlist backups) draws 16 in from the left', async () => {
    const r = await render(createElement(QueueBackupsScreen));
    const c = StyleSheet.flatten(byId(r, 'settings-scroll')[0]!.props['contentContainerStyle'] as never) as Record<string, unknown>;
    expect(c['paddingLeft']).toBe(16);
  });
});

describe('Check network (settings-network--screen, --results, toast--settings-network)', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    mockSubs = [{ feedUrl: 'https://feeds.example.fm/x.xml' }];
    fetchMock = jest.fn(() => Promise.resolve({ status: 200 }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });
  it('before a check: three rows, grey dots, "not checked yet", a dash, and one Start button', async () => {
    const r = await render(createElement(NetworkScreen));
    expect(byId(r, 'host-row')).toHaveLength(3);
    expect(byId(r, 'host-dot').map((d) => flat(d)['backgroundColor'])).toEqual([colour.glowGrey, colour.glowGrey, colour.glowGrey]);
    expect(flat(byId(r, 'host-dot')[0])).toMatchObject({ width: 10, height: 10 });
    expect(flat(byId(r, 'host-row')[0])['minHeight']).toBe(64);
    expect(words(r).filter((w) => w === 'not checked yet')).toHaveLength(3);
    expect(words(r)).toContain('Start the check');
    expect(words(r)).not.toContain('Copy the result');
  });
  it('after a check: green dots for an answer, the time, Copy the result beside Check again; Copy puts "Copied."', async () => {
    const r = await render(createElement(NetworkScreen));
    await press(r, 'Start the check');
    expect(byId(r, 'host-dot').map((d) => flat(d)['backgroundColor'])).toEqual([colour.ok, colour.ok, colour.ok]);
    expect(words(r)).toEqual(expect.arrayContaining(['Check again', 'Copy the result']));
    expect(words(r).some((w) => /^\d+ ms$/.test(w))).toBe(true);
    await press(r, 'Copy the result');
    expect(mockToast).toHaveBeenCalledWith('Copied.');
  });
  it('a host that did not answer is a hot dot and "Failed"', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('down')));
    const r = await render(createElement(NetworkScreen));
    await press(r, 'Start the check');
    expect(byId(r, 'host-dot')[0] && flat(byId(r, 'host-dot')[0]!)['backgroundColor']).toBe(colour.hot);
    expect(words(r)).toContain('Failed');
  });
});

describe('Not interested (settings-not-interested--screen, --empty, --signed-out, toast--settings-not-interested)', () => {
  const items = [{ kind: 'show', itemKey: 'f1', title: 'The Daily Grind' }, { kind: 'episode', itemKey: 'e9', title: 'Ep. 212 — The long goodbye to cash' }];
  it('rows: the kind in caps over the name, a Restore pill at the end, the edge label HIDDEN', async () => {
    mockDismissals = { items, loaded: true, restore: jest.fn(() => Promise.resolve()) };
    const r = await render(createElement(NotInterestedScreen));
    expect(byId(r, 'hidden-row')).toHaveLength(2);
    expect(flat(byId(r, 'hidden-row')[0])).toMatchObject({ minHeight: 60, paddingVertical: 13, paddingHorizontal: 16 });
    const kind = hosts(r, (n) => say(n.props['children']) === 'Show')[0]!;
    expect(flat(kind)).toMatchObject({ textTransform: 'uppercase' });
    expect(words(r)).toEqual(expect.arrayContaining(['HIDDEN', 'Episodes and shows For You no longer recommends.', 'No more to fetch']));
    await press(r, 'Restore The Daily Grind');
    expect(mockDismissals.restore).toHaveBeenCalledWith('show', 'f1');
    expect(mockToast).toHaveBeenCalledWith('Restored');
  });
  it('a refused restore says so', async () => {
    mockDismissals = { items, loaded: true, restore: jest.fn(() => Promise.reject(new Error('no'))) };
    const r = await render(createElement(NotInterestedScreen));
    await press(r, 'Restore The Daily Grind');
    expect(mockToast).toHaveBeenCalledWith("Couldn't restore — try again.");
  });
  it('empty: the kit block, 140 under the first line', async () => {
    const r = await render(createElement(NotInterestedScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Nothing hidden', 'Nothing hidden. Use ⋯ on a For You row to hide it.']));
    const spacer = hosts(r, (n) => flat(n)['height'] === SET.emptyTop && flat(n)['width'] === undefined)[0];
    expect(spacer).toBeDefined();
  });
  it('signed out: one tile with the sentence', async () => {
    mockListener = undefined;
    const r = await render(createElement(NotInterestedScreen));
    expect(words(r)).toContain('Sign in to see what you hid from For You.');
    expect(byId(r, 'hidden-row')).toHaveLength(0);
  });
});

describe('Playlist backups (settings-queue-backups--screen, --empty, --restore-dialog)', () => {
  const backup = (id: number, reason: 'chooser' | 'restore' | 'manual') => ({ id, createdAt: Date.UTC(2026, 9, 27, 8, 14), device: id === 1 ? undefined : 'iPad', reason, items: ['e1', 'e2', 'e3'] });
  it('the versions hang from a 2-wide spine, a dot each, the newest hot', async () => {
    mockBackups = [backup(3, 'chooser'), backup(2, 'restore'), backup(1, 'manual')];
    const r = await render(createElement(QueueBackupsScreen));
    expect(flat(byId(r, 'backups-spine')[0])).toMatchObject({ width: 2, left: 11 });
    const nodes = byId(r, 'backup-node');
    expect(nodes).toHaveLength(3);
    expect(String(nodes[0]!.props['className'])).toContain('bg-hot');
    expect(String(nodes[1]!.props['className'])).toContain('bg-raise2');
    expect(flat(nodes[0])).toMatchObject({ width: 12, height: 12, left: -29 });
    expect(flat(byId(r, 'backups-thread')[0])['paddingLeft']).toBe(34);
    expect(words(r)).toEqual(expect.arrayContaining(['The last 10 versions of your playlist on this phone.', 'Starts with Why mornings matter', 'Not kept when you chose a playlist', 'Saved before a restore', 'Saved by you']));
  });
  it('Restore asks first, then restores and says so; the pills are disabled meanwhile', async () => {
    mockBackups = [backup(3, 'chooser')];
    const r = await render(createElement(QueueBackupsScreen));
    const label = r.root.findAll((n) => String(n.props['accessibilityLabel'] ?? '').startsWith('Restore the playlist from'))[0]!.props['accessibilityLabel'] as string;
    await press(r, label);
    expect(words(r)).toContain('Restore this playlist?');
    expect(mockRestoreItem).not.toHaveBeenCalled();
    await act(async () => { r.root.findAll((n) => n.props['accessibilityLabel'] === 'Restore' && typeof n.props['onPress'] === 'function').slice(-1)[0]!.props['onPress'](); for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(mockRestoreItem).toHaveBeenCalledWith(3);
    expect(mockToast).toHaveBeenCalledWith('Playlist restored.');
  });
  it('empty: the kit block with the drawn sentence, no spine', async () => {
    const r = await render(createElement(QueueBackupsScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No backups yet', 'A backup is saved before a playlist is replaced.']));
    expect(byId(r, 'backups-spine')).toHaveLength(0);
  });
});

describe('Import or export (settings-opml--screen, --from-app, --found, toast--settings-opml)', () => {
  it('Export: the count at 56 in a tile, three numbered steps with 28 dots, the apps as chips', async () => {
    mockSubs = [{ feedUrl: 'a' }, { feedUrl: 'b' }];
    const r = await render(createElement(OpmlScreen));
    const count = hosts(r, (n) => say(n.props['children']) === '2' && flat(n)['fontSize'] === 56)[0];
    expect(count).toBeDefined();
    expect(byId(r, 'step-dot')).toHaveLength(3);
    expect(flat(byId(r, 'step-dot')[0])).toMatchObject({ width: 28, height: 28 });
    expect(words(r)).toEqual(expect.arrayContaining(['EXPORT', 'IMPORT', 'Export OPML from your other app', 'Paste it here', 'Subscribe', 'Nothing new to import', 'From Overcast']));
  });
  it('a chosen app opens its steps in a raise-2 tile; tapping again closes them', async () => {
    const r = await render(createElement(OpmlScreen));
    expect(byId(r, 'app-steps')).toHaveLength(0);
    await press(r, 'From Overcast');
    expect(flat(byId(r, 'app-steps')[0])['backgroundColor']).toBe(colour.raise2);
    await press(r, 'From Overcast');
    expect(byId(r, 'app-steps')).toHaveLength(0);
  });
  it('pasted OPML: "1 show found, 1 new." and Subscribe to 1; subscribing toasts and clears', async () => {
    const r = await render(createElement(OpmlScreen));
    const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'OPML to import' && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { field.props['onChangeText']('<opml version="2.0"><body><outline type="rss" xmlUrl="https://example.com/capture-feed.xml"/></body></opml>'); });
    expect(words(r)).toEqual(expect.arrayContaining(['1 show found, 1 new.', 'Subscribe to 1']));
    await press(r, 'Subscribe to 1');
    expect(mockToast).toHaveBeenCalledWith('Subscribed to 1 show.');
    expect(mockStores.subscriptions.add).toHaveBeenCalledWith('https://example.com/capture-feed.xml', expect.any(Number));
  });
  it('Export with nothing to export says so; with shows it opens the share panel', async () => {
    const r = await render(createElement(OpmlScreen));
    await press(r, 'Export subscriptions');
    expect(mockToast).toHaveBeenCalledWith('You have no subscriptions to export.');
    mockSubs = [{ feedUrl: 'https://a/x.xml' }];
    const r2 = await render(createElement(OpmlScreen));
    await press(r2, 'Export subscriptions');
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ heading: 'Export subscriptions' }));
  });
});

describe('Third-party sharing (settings-sharing--screen)', () => {
  it('a lead tile, the sentence, and one tile per party read as one sentence', async () => {
    const r = await render(createElement(SharingScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No advertising or analytics companies receive anything from SocialNet.', 'The 5 parties that do, and why:']));
    const tiles = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string' && String(n.props['accessibilityLabel']).includes('. Shared: '));
    expect(tiles).toHaveLength(5);
    expect(tiles[0]!.props['accessibilityLabel']).toBe('Podcast publishers. Each show’s own feed and audio host. Shared: Your IP address and app name, when a feed or episode is fetched. Why: To play and download episodes — SocialNet never hosts audio');
    expect(flat(tiles[0])).toMatchObject({ borderRadius: 22, padding: 14 });
    expect(words(r).filter((w) => w === 'Shared')).toHaveLength(5);
  });
});

describe('Widgets (settings-widgets--screen)', () => {
  it('four drawings: two wide 120 x 60 and two square 60 x 60, radius 14, with hot squares', async () => {
    const r = await render(createElement(WidgetsScreen));
    const d = byId(r, 'widget-drawing');
    expect(d.map((n) => flat(n)['width'])).toEqual([120, 120, 60, 60]);
    expect(d.every((n) => flat(n)['height'] === 60 && flat(n)['borderRadius'] === 14)).toBe(true);
    expect(words(r)).toEqual(expect.arrayContaining(['HOW TO', 'THE FOUR', 'How to add a widget', 'Now playing', 'Playlist', 'Daily pick', 'Listening this week']));
  });
  it('the steps are numbered in mono hot-text', async () => {
    const r = await render(createElement(WidgetsScreen));
    const one = hosts(r, (n) => say(n.props['children']) === '1' && String(n.props['className'] ?? '').includes('text-hotText'));
    expect(one.length).toBeGreaterThan(0);
  });
});

describe('Check for updates on an iPhone (settings-updates--screen)', () => {
  it('is one tile with the one line', async () => {
    const r = await render(createElement(UpdatesScreen));
    expect(words(r)).toContain('On iPhone, the App Store keeps SocialNet up to date.');
  });
});
