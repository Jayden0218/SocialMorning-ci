// The Updates tab at 200 % text: the Voice and Starred sections are as tall as their turned edge labels, so the labels never overlap.
/**
 * M31 F10 (FR-031; contact/fontscale2/README.md F12). Written BEFORE the fix: red on the code as it stands. The Voice block is `height: 92` and the Starred block
 * `height: 70` (the drawn pitches); the turned label "STARRED" / "VOICE" is as long as its text, which grows with the system font, so at 200 % the two labels and the
 * swipe hint overlap. The F8 fix for Settings (`Section` in src/ui/settings/panel.tsx) is the pattern: the block takes `EdgeLabel`'s `onLength` and is at least that tall -
 * `minHeight` = max(the drawn pitch, the label's length + 2), and no fixed `height`. The old test m31-da-updates "Voice (signed in) is 92 tall, Starred 70" reads `height`:
 * phase 2 changes it to `minHeight`.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act } from 'react-test-renderer';
import { episode, FEED, hash, mount, seededStores } from './support/screen-kit';
import { createMemoryStores } from '@/storage/memory';

const mockRef: { stores: ReturnType<typeof seededStores> } = { stores: undefined as never };
const mockToast = jest.fn();
const mockRouter = { push: jest.fn() };
const mockSocial: { listener: unknown; api?: unknown } = { listener: undefined };
const mockPlayer = { load: jest.fn(), pause: jest.fn() };
const mockDl = { subscribe: jest.fn(() => () => undefined), request: jest.fn(() => Promise.resolve({ kind: 'ok' })) };
const mockPos = { flush: jest.fn(() => Promise.resolve()) };
const mockSync = { push: jest.fn(), reconcile: jest.fn(() => Promise.resolve()) };
const mockDiscover: { view: unknown } = { view: undefined };
const mockRefresh = jest.fn(() => Promise.resolve({ stale: [] as string[] }));
const mockSheet: { props?: { actions: { label: string; onPress: () => void }[] } } = {};
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => mockRouter, useScrollToTop: () => undefined, useFocusEffect: (f: () => void) => { useEffect(() => f(), [f]); }, router: mockRouter };
});
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockRef.stores, useToast: () => mockToast, useDownloads: () => mockDl, useSubscriptionSync: () => mockSync, usePositionSync: () => mockPos,
}));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: true, now: false, player: false }) }));
const mockSafety = { hiddenFeeds: new Set<string>() };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: { x: 3 } }), voicePosts: () => Promise.resolve([]), deleteVoicePost: jest.fn() };
const mockProfile = { me: undefined };
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfile }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => true, selectIdle: () => true }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => mockDiscoverApi }));
const mockDiscoverApi = { get view() { return mockDiscover.view; }, open: jest.fn() };
jest.mock('@/feeds/refresh-service', () => ({ refreshFeeds: (...a: unknown[]) => (mockRefresh as (...x: unknown[]) => unknown)(...a) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: ({ list }: { list: React.ReactElement }) => list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/social/VoicePosts', () => ({ VoicePosts: (p: { variant?: string }) => require('react').createElement('View', { testID: 'voice-posts', variant: p.variant }) }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: (p: { actions: { label: string; onPress: () => void }[] }) => { mockSheet.props = p; return null; } }));

import UpdatesScreen from '../app/(tabs)/library';

const NOW = Date.now();
function setup(opts: { starred?: boolean; subscribed?: boolean } = {}) {
  const stores = opts.subscribed === false ? createMemoryStores(hash) : seededStores([episode('a', 'Why mornings matter', NOW - 3_600_000), episode('b', 'Cities that sleep late', NOW - 7_200_000)]);
  if (opts.subscribed !== false) stores.subscriptions.add(FEED, 1);
  if (opts.starred) stores.subscriptions.setStarred(FEED, true, 2);
  mockRef.stores = stores as never;
  mockRouter.push.mockClear(); mockToast.mockClear(); mockRefresh.mockClear();
  return stores;
}
const mounted: { unmount: () => void }[] = [];
const mountScreen = async () => { const r = await mount(createElement(UpdatesScreen)); mounted.push(r); return r; };


const style2 = (n: { props: Record<string, unknown> }) => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, number>;

describe('Updates edge labels at 200 %', () => {
  beforeEach(() => { mockSocial.listener = { listenerId: 'me', displayName: 'Me' }; mockDiscover.view = undefined; mockSheet.props = undefined; });
  afterEach(() => { while (mounted.length) act(() => { mounted.pop()!.unmount(); }); });

  const measure = (r: Awaited<ReturnType<typeof mount>>, block: string, width: number) => {
    const root = r.root.findAllByProps({ testID: block }).find((n) => typeof n.type === 'string')!;
    const probe = root.findAll((n) => String(n.type) === 'Text' && typeof n.props['onLayout'] === 'function')[0]!;
    act(() => { (probe.props['onLayout'] as (e: unknown) => void)({ nativeEvent: { layout: { width, height: 11, x: 0, y: 0 } } }); });
    return style2(r.root.findAllByProps({ testID: block }).find((n) => typeof n.type === 'string')!);
  };

  it('the Voice block has no fixed height and is at least as tall as its turned label (a 140 long VOICE at 200 %)', async () => {
    setup({ starred: true });
    const r = await mountScreen();
    const s = measure(r, 'voice-block', 140);
    expect(s['height']).toBeUndefined();
    expect(s['minHeight']).toBeGreaterThanOrEqual(140);
  });
  it('the Starred block likewise (a 150 long STARRED)', async () => {
    setup({ starred: true });
    const r = await mountScreen();
    const s = measure(r, 'starred-block', 150);
    expect(s['height']).toBeUndefined();
    expect(s['minHeight']).toBeGreaterThanOrEqual(150);
  });
  it('with a short label the blocks keep the drawn pitches as their least height (92 and 70)', async () => {
    setup({ starred: true });
    const r = await mountScreen();
    expect(measure(r, 'voice-block', 30)['minHeight']).toBeGreaterThanOrEqual(92);
    expect(measure(r, 'starred-block', 30)['minHeight']).toBeGreaterThanOrEqual(70);
  });
});
