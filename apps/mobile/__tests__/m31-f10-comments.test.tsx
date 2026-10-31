// The Comments pages at 200 % text, for a visitor, and with a huge count: no word broken mid-word, no chip cut, a menu that matches the drawing.
/**
 * M31 F10 (FR-031; contact/fontscale2/README.md F9, contact/widths/README.md W1, contact/wave-7/README.md defects 1 and 2). Written BEFORE the fix: red where noted.
 *   F9  the title "Comments" is one line that shrinks to fit (it was two lines, "Commen / ts"); the order chips ("Most liked") shrink to fit on one line;
 *       the time chip and the HOST badge are `minHeight` boxes, not fixed heights (their text was cut in half).
 *   W1  a like count of 12 345 678 prints "12.3M", and "n replies" the same way.
 *   wave-7 1  a visitor's menu on another's comment lists Share, Copy, Save, Report (design-pulse2 social.html `comments--comment-menu-signed-out`: "No Mute, no
 *       Mark as unfriendly (both need an account)"). Expected to PASS today: the page already gates both rows on a signed-in listener, so the wave-7 picture
 *       was a capture that opened the menu before the listener was known; this test pins the rule.
 *   wave-7 2  the Reply sheet (`composerSheet({reply:true})`): the card holds the mono word "Reply" over the episode title, with no "At 12:32" chip and no
 *       "Remove the moment" x. NOT asked: the 0 / 500 counter (the drawing says 500, the server allows 2000 - words.ts WORDS_MAX), and the dimmed Post.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSeek = jest.fn();
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Me' };
let mockParams: Record<string, string> = { episodeId: 'e1' };
let mockLive: number | undefined;
let mockImages = true;
let mockHasCache = true;
let mockStale = false;
let mockThread: { parent: unknown; replies: unknown[] } | 'fail' = { parent: undefined, replies: [] };
const mockSettings = new Map<string, string>();
const mockHeat = Array.from({ length: 100 }, (_, i) => (i === 30 ? 1 : 0.1));
const mockCached: { social: { serverTime: string; episode: { id: string; durationMs: number }; comments: unknown[]; heat: unknown } } = {
  social: { serverTime: '2026-10-28T12:00:00Z', episode: { id: 'e1', durationMs: 600_000 }, comments: [], heat: { available: true, buckets: mockHeat } },
};

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), canGoBack: () => true, replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => { const { useEffect } = jest.requireActual('react'); useEffect(() => cb(), [cb]); },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/shell/providers', () => {
  const stores = {
    settings: { get: (k: string) => mockSettings.get(k), set: (k: string, v: string) => { mockSettings.set(k, v); }, delete: (k: string) => { mockSettings.delete(k); } },
    feeds: {
      getEpisode: (id: string) => (id === 'e1' ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Why mornings matter', durationMs: 600_000, imageUrl: undefined } : undefined),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Morning Notes' }),
    },
    positions: { get: () => ({ offsetMs: 120_000 }) },
  };
  return { useStores: () => stores, useToast: () => jest.fn() };
});
jest.mock('@/social/context', () => {
  const value = {
    api: { creatorClaims: () => Promise.resolve([]) },
    composer: { open: jest.fn((a: unknown, p?: string) => ({ ...(a as object), parentId: p, body: '', moment: { offsetMs: 0 } })), remove: jest.fn(), canSubmit: () => false, edit: (s: unknown) => s, removeMoment: (s: unknown) => s, submit: jest.fn() },
    listener: undefined as unknown,
    bump: jest.fn(),
    refresh: jest.fn(),
    useEpisodeSocial: () => ({ cached: mockHasCache ? mockCached : undefined, stale: mockStale }),
  };
  return { useSocial: () => { value.listener = mockListener; return value; } };
});
jest.mock('@/social/usePoll', () => ({ usePoll: () => undefined }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ comments: (c: unknown[]) => c, safety: { report: () => 'hidden' } }), announce: jest.fn() }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => ({ likeComment: jest.fn(), unlikeComment: jest.fn(), episodePageUrl: () => 'https://x/e1' }) }));
jest.mock('@/social/comment-extras-api', () => {
  const actual = jest.requireActual('@/social/comment-extras-api');
  return { ...actual, useCommentExtrasApi: () => ({ imagesOn: () => Promise.resolve(mockImages), thread: () => (mockThread === 'fail' ? Promise.reject(new Error('x')) : Promise.resolve(mockThread)), acceptRules: jest.fn() }) };
});
jest.mock('@/social/api-m22-server', () => ({ useM22Api: () => ({ pinBottom: jest.fn() }) }));
jest.mock('@/social/api-m22-social', () => ({ useM22SocialApi: () => ({ setLikeNotices: jest.fn() }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 2 })) }));
jest.mock('@/social/live', () => ({ liveLabel: (n: number | undefined) => (n !== undefined && n >= 2 ? `${n} listening now` : undefined), useListeningNow: () => mockLive }));
jest.mock('@/social/voice-text', () => ({ textRecorder: () => undefined }));
jest.mock('@/playback/expo-audio-adapter', () => ({
  playVoice: jest.fn(() => ({ stop: jest.fn() })),
  askMicrophone: () => Promise.resolve(true),
  voiceSessionOn: () => Promise.resolve(),
  voiceSessionOff: () => Promise.resolve(),
  useVoiceRecorder: () => ({ recorder: { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }, state: { durationMillis: 8000 } }),
}));
jest.mock('@/storage/playable', () => ({ toPlayable: () => ({ id: 'e1', url: 'https://a/x.mp3', title: 't', showTitle: 's' }) }));

import { PlayerProvider, createPlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { CommentRow, repliesLink } from '@/ui/comments/CommentRow';
import { ComposerSheet } from '@/ui/comments/Composer';
import { Capsule, ZoneTitle } from '@/ui/comments/CommentsBottom';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import CommentsScreen from '../app/comments/[episodeId]';
import type { Comment } from '@/social/api';

const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  // The host node (a composite such as PulseButton carries the same props without the styling).
  const all = r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
  const hit = all.find((n) => typeof n.type === 'string') ?? all[0];
  if (!hit) throw new Error(`no pressable "${label}" in: ${labels(r).join(' | ')}`);
  return hit;
};

const rendered: ReactTestRenderer[] = [];
function inset(top: number, bottom: number, child: React.ReactElement): React.ReactElement {
  return createElement(SafeAreaInsetsContext.Provider, { value: { top, bottom, left: 0, right: 0 } }, child);
}
function harness() {
  let listener: ((e: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = { execute: async () => undefined, subscribe: (l) => { listener = l; return () => undefined; }, configure: async () => undefined, release: () => undefined };
  const runtime = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1, notify: () => undefined });
  return { runtime, push: (e: AdapterEvent) => listener?.(e) };
}
function mount(el: React.ReactElement, insets = { top: 50, bottom: 34 }): ReactTestRenderer {
  const h = harness();
  let r!: ReactTestRenderer;
  act(() => { r = create(inset(insets.top, insets.bottom, createElement(GluestackUIProvider, null, createElement(PlayerProvider, { runtime: h.runtime }, el)))); });
  rendered.push(r);
  return r;
}

const SERVER = '2026-10-28T12:00:00Z';
const c = (over: Partial<Comment> & { id: string }): Comment =>
  ({ authorId: 'a1', displayName: 'Rui', body: 'This is the part I replay every morning.', offsetMs: 872_000, parentId: null, createdAt: '2026-10-28T07:00:00Z', deleted: false, likeCount: 41, ...over });


const flatStyle = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hostTexts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => String(n.type) === 'Text');
const said = (n: ReactTestInstance): string => [n.props['children']].flat(5).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).join('');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(SERVER));
  setReducedMotionForTest(true);
  mockListener = { listenerId: 'me', displayName: 'Me' };
  mockParams = { episodeId: 'e1' };
  mockLive = undefined;
  mockImages = true;
  mockHasCache = true;
  mockStale = false;
  mockThread = { parent: undefined, replies: [] };
  mockSettings.clear();
  mockCached.social.comments = [];
});
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

describe('F10-C1 the title row and the chips at font scale 2 (F9)', () => {
  it('"Comments" is one line that shrinks to fit, never "Commen / ts"', () => {
    const r = mount(createElement(ZoneTitle, { title: 'Comments', count: 5, back: { icon: 'chevron-back', label: 'Back', onPress: jest.fn() } }));
    const t = hostTexts(r).find((x) => said(x) === 'Comments')!;
    expect(t.props['numberOfLines']).toBe(1);
    expect(t.props['adjustsFontSizeToFit']).toBe(true);
  });
  it('the order chips are one line each that shrink to fit ("Most liked", "By moment")', () => {
    const r = mount(createElement(Capsule, { items: [{ value: 'newest', label: 'Newest' }, { value: 'liked', label: 'Most liked' }, { value: 'byMoment', label: 'By moment' }], value: 'newest', onChange: jest.fn() }));
    for (const label of ['Newest', 'Most liked', 'By moment']) {
      const t = hostTexts(r).find((x) => said(x) === label)!;
      expect([label, t.props['numberOfLines'], t.props['adjustsFontSizeToFit']]).toEqual([label, 1, true]);
    }
  });
  it('the time chip ("12:32") has a minimum height, not a fixed one', () => {
    const r = mount(createElement(TimestampChip, { text: '12:32' }));
    const box = r.root.findAll((n) => typeof n.type === 'string' && Number(flatStyle(n)['paddingHorizontal']) > 0)[0]!;
    expect(flatStyle(box)['height']).toBeUndefined();
    expect(Number(flatStyle(box)['minHeight'])).toBeGreaterThanOrEqual(22);
  });
  it('the HOST badge has a minimum height, not a fixed one', () => {
    const r = mount(createElement(CommentRow, { c: c({ id: 'c1', host: true } as never), serverTime: SERVER, likeOf: (y: Comment) => ({ count: y.likeCount ?? 0, liked: false }), onSeek: mockSeek, onLike: jest.fn(), onMenu: jest.fn() }));
    const badge = hostTexts(r).find((x) => said(x) === 'HOST')!;
    expect(flatStyle(badge)['height']).toBeUndefined();
    expect(Number(flatStyle(badge)['minHeight'])).toBeGreaterThanOrEqual(16);
  });
});

describe('F10-C2 big counts (W1)', () => {
  it('a comment liked 12 345 678 times shows "12.3M" and "12345678 replies" shows "12.3M replies"', () => {
    const r = mount(createElement(CommentRow, { c: c({ id: 'c1', likeCount: 12_345_678 }), serverTime: SERVER, likeOf: (y: Comment) => ({ count: y.likeCount ?? 0, liked: false }), onSeek: mockSeek, onLike: jest.fn(), onMenu: jest.fn() }));
    const w = hostTexts(r).map(said);
    expect(w).toContain('12.3M');
    expect(w).not.toContain('12345678');
    expect(repliesLink(12_345_678)).toBe('12.3M replies \u203a');
    expect(repliesLink(1)).toBe('1 reply \u203a');
    expect(repliesLink(0)).toBeUndefined();
  });
});

describe('F10-C3 a visitor\'s comment menu (wave-7 defect 1; expected to pass today)', () => {
  it('signed out, another listener\'s comment: Share, Copy, Save, Report - no Mute or Mark as unfriendly', () => {
    mockListener = undefined;
    mockCached.social.comments = [c({ id: 'c1', authorId: 'a1', displayName: 'Rui' })];
    const r = mount(createElement(CommentsScreen));
    act(() => { pressable(r, 'More for this comment').props['onPress'](); });
    const rows = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
    for (const want of ['Share', 'Copy', 'Save', 'Report']) expect(rows).toContain(want);
    for (const not of ['Mute', 'Mark as unfriendly', 'Unmark', 'Delete']) expect(rows).not.toContain(not);
    // The card's own "Reply" button is the one "Reply" on the page; the menu adds none for a visitor.
    expect(rows.filter((x) => x === 'Reply').length).toBeLessThanOrEqual(1);
  });
  it('signed in, another listener\'s comment: the menu keeps Mute and Mark as unfriendly', () => {
    mockCached.social.comments = [c({ id: 'c1', authorId: 'a1', displayName: 'Rui' })];
    const r = mount(createElement(CommentsScreen));
    act(() => { pressable(r, 'More for this comment').props['onPress'](); });
    const rows = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
    for (const want of ['Share', 'Copy', 'Save', 'Mute', 'Mark as unfriendly', 'Report']) expect(rows).toContain(want);
  });
});

describe('F10-C4 the Reply sheet (wave-7 defect 2)', () => {
  const sheet = (initial: object): ReactTestRenderer => mount(createElement(ComposerSheet, { initial: initial as never, onClose: jest.fn(), onPosted: jest.fn() }));
  it('a reply names itself "Reply" on the card: no "At 12:32" chip and no "Remove the moment" x', () => {
    const r = sheet({ episodeId: 'e1', body: '', parentId: 'c1', moment: { offsetMs: 752_000 } });
    const w = hostTexts(r).map(said);
    expect(w).toContain('Reply');
    expect(w).not.toContain('At 12:32');
    expect(labels(r)).not.toContain('Remove the moment');
  });
  it('a new comment keeps its moment chip and the x (expected to pass today)', () => {
    const r = sheet({ episodeId: 'e1', body: '', moment: { offsetMs: 752_000 } });
    expect(hostTexts(r).map(said)).toContain('At 12:32');
    expect(labels(r)).toContain('Remove the moment');
  });
});
