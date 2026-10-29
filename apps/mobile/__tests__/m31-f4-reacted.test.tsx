/**
 * M31 F4 (phase 1, red first): the status viewer's "Reacted:" line is OWNER-ONLY (server privacy rule) and uses the drawn
 * format (design-pulse2 social.html: "Reacted: Bea ❤️, Jo 🎧, Tom 👏 and 22 more"): the first 3 names with their glyphs, then "and N more".
 * (The line is drawn by StatusReplies, inside the viewer.)
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockPostText = jest.fn(() => Promise.resolve());
let mockListener: unknown = { id: 'me' };
let mockStatuses: unknown[] = [];
let mockReplies: unknown[] = [];
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 's1' }),
  usePathname: () => '/status/s1',
}));
const mockVoice = { recorder: { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }, state: { durationMillis: 0 } };
jest.mock('@/playback/expo-audio-adapter', () => ({
  askMicrophone: () => Promise.resolve(true),
  playVoice: () => ({ stop: jest.fn() }),
  useVoiceRecorder: () => mockVoice,
  voiceSessionOn: () => Promise.resolve(),
  voiceSessionOff: () => Promise.resolve(),
}));
const mockStores = { settings: { get: () => undefined }, queue: { list: () => [] }, feeds: { getEpisode: () => undefined, getShow: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockPlayer = { pause: jest.fn(), load: jest.fn() };
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayer: () => mockPlayer }));
// Stable objects: the real hooks are memoised, and a fresh one each render would re-run their effects for ever.
const mockApi = { registerEpisode: () => Promise.resolve(), search: () => Promise.resolve({ episodes: [] }) };
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: mockListener, api: mockApi }) }));
const mockM22 = {
  statuses: () => Promise.resolve(mockStatuses),
  status: () => Promise.reject(new Error('gone')),
  replies: () => Promise.resolve(mockReplies),
  react: () => Promise.resolve(),
  unreact: () => Promise.resolve(),
  stopSuggesting: () => Promise.resolve(),
  postTextStatus: () => Promise.resolve(),
};
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => mockM22 }));
jest.mock('@/social/us8-api', () => ({ ...jest.requireActual('@/social/us8-api'), useUs8Api: () => ({ postTextStatus: (...a: unknown[]) => (mockPostText as (...x: unknown[]) => Promise<void>)(...a) }) }));
const mockSafety = { safety: { isHidden: () => false } };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('@/social/comment-image', () => ({ pickCommentImage: () => Promise.resolve({ kind: 'cancelled' }) }));
jest.mock('@/me/history', () => ({ listeningHistory: () => [] }));
jest.mock('@/telemetry/reportError', () => ({ reportAndDrop: () => () => undefined }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import StatusScreen from '../app/status/[id]';


jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  mockListener = { id: 'me' };
  mockStatuses = [];
  mockReplies = [];
});
const mount = async (el: React.ReactElement): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, el)); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

const KINDS = [1, 6, 3, 2, 4, 5];
const NAMES = ['Bea', 'Jo', 'Tom'];
const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: NAMES[i] ?? `Person${i + 1}`, kind: KINDS[i % KINDS.length]! }));
const status = (o: Record<string, unknown> = {}) => ({
  id: 's1', mine: true, author: { id: 'me', name: 'Me', initials: 'M' }, durationMs: 41_000, url: 'https://x/a.m4a', text: 'Three episodes in', createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 18 * 3_600_000 - 1000).toISOString(), items: [], reactions: [{ kind: 1, count: 12 }], myReaction: null, ...o,
});
const line = (r: ReactTestRenderer): string | undefined => {
  const hit = r.root.findAll((n) => typeof n.type === 'string' && n.children.some((c) => typeof c === 'string' && c.startsWith('Reacted:')));
  return hit[0]?.children.find((c): c is string => typeof c === 'string' && c.startsWith('Reacted:'));
};

describe('M31 F4: the "Reacted:" line (owner only; 3 names then "and N more")', () => {
  it('(a) owner, 25 reactions: exactly the first 3 names with their glyphs, then "and 22 more"', async () => {
    mockStatuses = [status({ reactedBy: people(25) })];
    const r = await mount(createElement(StatusScreen));
    expect(line(r)).toBe('Reacted: Bea ❤️, Jo 🎧, Tom 👏 and 22 more');
    expect(texts(r)).not.toContain('Person4');
  });
  it('(b) owner, 3 or fewer: all names, no "and N more"', async () => {
    mockStatuses = [status({ reactedBy: people(3) })];
    const r3 = await mount(createElement(StatusScreen));
    expect(line(r3)).toBe('Reacted: Bea ❤️, Jo 🎧, Tom 👏');
    mockStatuses = [status({ reactedBy: people(2) })];
    const r2 = await mount(createElement(StatusScreen));
    expect(line(r2)).toBe('Reacted: Bea ❤️, Jo 🎧');
    expect(texts(r2)).not.toContain('more');
  });
  it('(c) owner, exactly 4: three names and "and 1 more"', async () => {
    mockStatuses = [status({ reactedBy: people(4) })];
    const r = await mount(createElement(StatusScreen));
    expect(line(r)).toBe('Reacted: Bea ❤️, Jo 🎧, Tom 👏 and 1 more');
  });
  it('(d) not the owner: the line is never shown, even if reactedBy arrives', async () => {
    mockStatuses = [status({ mine: false, author: { id: 'u2', name: 'Ana', initials: 'A' }, reactedBy: people(25) })];
    const r = await mount(createElement(StatusScreen));
    expect(texts(r)).not.toContain('Reacted:');
    expect(texts(r)).not.toContain('Bea');
  });
});
