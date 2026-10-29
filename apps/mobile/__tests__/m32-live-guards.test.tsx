// A8 (T036): async effects stop at unmount / sign-out — a late answer changes nothing.
/**
 * Break that turns each red: remove the `live` flag from the effect in
 * src/ui/discover/TheirLikes.tsx, src/ui/episode/DownloadButton.tsx or app/settings/privacy.tsx.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const mockLikes = { pending: undefined as unknown as Deferred<{ items: unknown[] }> };
const mockApi = { likesTimeline: () => mockLikes.pending.promise, me: async () => ({}) };
const mockDl = { get: jest.fn(() => undefined), verifyPending: undefined as unknown as Deferred<boolean>, off: jest.fn() };
const mockDownloads = { verify: () => mockDl.verifyPending.promise, subscribe: () => mockDl.off };
const mockSettings = { get: jest.fn(() => ''), set: jest.fn() };
const mockStores = { downloads: mockDl, settings: mockSettings, blocks: { all: () => [] } };
const mockMe = { pending: undefined as unknown as Deferred<{ privateListening?: boolean }> };
const mockSocial = { api: { me: () => mockMe.pending.promise }, listener: { listenerId: 'me' } };

const mockColours = { text: '#000', accent: '#f00' };
const mockToast = () => undefined;
const mockExtras = { mutes: async () => [], threads: async () => [] };
const mockAcct = {};
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => ({ usePathname: () => '/', useIsFocused: () => true,  router: { push: jest.fn() }, Link: () => null }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockApi, privacySwitchesOf: () => ({}) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => mockDownloads }));
jest.mock('@/ui/kit/useColours', () => ({ useColours: () => mockColours }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/comment-extras-api', () => ({ useCommentExtrasApi: () => mockExtras }));
jest.mock('@/social/account-api', () => ({ useAccountApi: () => mockAcct }));
for (const m of ['@/ui/kit/Artwork', '@/ui/kit/Avatar', '@/ui/kit/Card', '@/ui/discover/parts', '@/ui/queue/QueueButtons', '@/ui/kit/PageHeader', '@/ui/kit/Icon', '@/ui/kit/Toggle', '@/ui/social/MutedThreads', '@/ui/settings/OftenListenedSwitch']) {
  jest.doMock(m, () => new Proxy({}, { get: (_t, k) => (k === '__esModule' ? true : k === 'Pager' ? (p: { count: number }) => `pager-${p.count}` : k === 'SectionTitle' ? () => 'Their likes' : () => null) }));
}

// D-C: "Their likes" is a Deck under an edge label; the Deck's parts are plain pass-throughs here, the label keeps its words.
jest.doMock('@/ui/discover/Deck', () => {
  const { createElement: h } = require('react');
  return {
    __esModule: true,
    DECK: { pad: 14, gap: 10 },
    UNBOUNDED: { 15: {} },
    useEdge: (t: string) => ({ label: t, spoken: t }),
    DeckSection: (p: { label: string; children: unknown }) => h('section', { accessibilityLabel: p.label }, p.children),
    Deck: (p: { children: unknown }) => h('deck', null, p.children),
    DeckCard: (p: { children: unknown }) => h('card', null, p.children),
  };
});

it('TheirLikes: an answer that arrives after sign-out shows nothing', async () => {
  const { TheirLikes } = require('@/ui/discover/TheirLikes') as typeof import('@/ui/discover/TheirLikes');
  mockLikes.pending = deferred();
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(TheirLikes, { signedIn: true })); });
  await act(async () => { r.update(createElement(TheirLikes, { signedIn: false })); });
  mockLikes.pending.resolve({ items: [{ listener: { id: 'x', displayName: 'X' }, episode: { id: 'e', title: 'T', showTitle: 'S' } }] });
  await flush();
  expect(JSON.stringify(r.toJSON())).not.toContain('Their likes');
});

it('DownloadButton: a late verify after unmount does not read the store again', async () => {
  const { DownloadButton } = require('@/ui/episode/DownloadButton') as typeof import('@/ui/episode/DownloadButton');
  mockDl.verifyPending = deferred();
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(DownloadButton, { episodeId: 'e1' })); });
  const reads = mockDl.get.mock.calls.length;
  await act(async () => { r.unmount(); });
  mockDl.verifyPending.resolve(true);
  await flush();
  expect(mockDl.get.mock.calls.length).toBe(reads);
  expect(mockDl.off).toHaveBeenCalled();
});

it('Privacy settings: a late answer after leaving does not write the mirror', async () => {
  const Privacy = (require('../app/settings/privacy') as { default: React.ComponentType }).default;
  mockMe.pending = deferred();
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(Privacy)); });
  mockSettings.set.mockClear();
  await act(async () => { r.unmount(); });
  mockMe.pending.resolve({ privateListening: true });
  await flush();
  expect(mockSettings.set).not.toHaveBeenCalled();
});
