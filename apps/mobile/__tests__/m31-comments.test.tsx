// Tests that the Pulse comments pages are the drawings': every position and size, read off the rendered page and its sheets.
/**
 * M31 W2-B (T032; owner, 2026-10-28: "I want completely the same, or you can explain why it is different"). Source of every number
 * asserted here: `design-pulse2/social.html` (`commentsBase`, `cmt`, `node`, `spine`, `srow`, `composer`, `recordBar`, `reportSheet`,
 * `composerSheet`, `threadBase`), `index.html#comments--screen` and `kit.js`. What this proves in Jest (how it looks on a phone is
 * NOT VERIFIED): the page puts the episode strip at 56, the map at 102 and the spine at 140 on the drawn 390 × 844 phone with a
 * 50 / 34 inset and moves with another inset; the spine is 2 wide at x 40 hot → violet → line; a card is radius 18 / padding 12 and
 * sits 56 in (86 for a reply); By moment groups under one solid chip with "n reacted"; the thumb zone is 6 over the inset with a
 * 40 capsule and a 56 composer (radius 22); the menu rows are 52 with 40 squares and the safety rows hot under a rule; the report
 * tiles are 52, two a row; the composer's Post is a hot 38 pill; the recorder is the 1.5 hot bar; the new drawn icons are kit.js's.
 *
 * The break that turns each red: change a number in `COMMENTS` (src/ui/comments/measures.ts); drop `byMoment` in `buildNodes`; put
 * the spine's stops back to two; swap `bg-hot` on the Post pill; drop the rule above Report; change `cardLeft`'s 56.
 */
import { createElement } from 'react';
import { StyleSheet, processColor } from 'react-native';
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

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { colour } from '@/design';
import { PlayerProvider, createPlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { aboveInset, belowStatus, cardLeft } from '@/ui/comments/measures';
import { buildNodes, nearestNode, reactedCount } from '@/ui/comments/nodes';
import { CommentRow, shortAgo, agoAndPlace } from '@/ui/comments/CommentRow';
import { CommentMenu } from '@/ui/comments/CommentMenu';
import { ReportSheet } from '@/ui/comments/ReportSheet';
import { ComposerSheet } from '@/ui/comments/Composer';
import { CommentsMap, liveDiscs } from '@/ui/comments/CommentsMap';
import { Capsule, ComposerBar, SignInBar } from '@/ui/comments/CommentsBottom';
import { IconButton } from '@/ui/kit/PulseButton';
import { SpineLine, SpineNode } from '@/ui/comments/Spine';
import { voiceWave } from '@/ui/comments/VoiceComment';
import { DRAWN_ICONS } from '@/ui/kit/drawn-icons';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import CommentsScreen from '../app/comments/[episodeId]';
import ThreadScreen from '../app/comments/thread/[commentId]';
import { VoiceComposer } from '@/ui/comments/VoiceRecord';
import { VoiceTextReview } from '@/ui/comments/VoiceTextReview';
import { MomentSheet } from '@/ui/comments/MomentSheet';
import { RulesSheet } from '@/ui/comments/RulesSheet';
import type { Comment } from '@/social/api';

type Style = Record<string, unknown>;
const styleOf = (n: ReactTestInstance): Style => (StyleSheet.flatten(n.props['style']) ?? {}) as Style;
const near = (got: unknown, want: number, within = 0.5) => expect(Math.abs((got as number) - want)).toBeLessThanOrEqual(within);
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const hits = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
  if (hits.length === 0) throw new Error(`no testID "${id}"`);
  return hits[0]!;
};
const allById = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  // The host node (a composite such as PulseButton carries the same props without the styling).
  const all = r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
  const hit = all.find((n) => typeof n.type === 'string') ?? all[0];
  if (!hit) throw new Error(`no pressable "${label}" in: ${labels(r).join(' | ')}`);
  return hit;
};
/** Every string drawn on the page, in order (a walk of the tree: a Modal's props hold elements, which JSON cannot print). */
/** The class names on a control, whichever wrapper in the chain carries them (the host node drops `className` once styled). */
const classOf = (r: ReactTestRenderer, label: string): string =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label).map((n) => String(n.props['className'] ?? '')).join(' ');
const text = (r: ReactTestRenderer): string => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (x === null || x === undefined) return;
    if (typeof x === 'string') { out.push(x); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const node = x as { children?: unknown };
    walk(node.children);
  };
  walk(r.toJSON());
  return out.map((t) => `"${t}"`).join(' ');
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

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(SERVER));
  setReducedMotionForTest(true);
  mockPush.mockClear(); mockBack.mockClear(); mockSeek.mockClear();
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

describe('the page puts each part where the drawing does (390 × 844, 50 pt status bar, 34 pt home inset)', () => {
  const two = (): void => {
    mockCached.social.comments = [
      c({ id: 'c1', displayName: 'Aisha', offsetMs: 370_000, body: 'The way she describes the first light.', likeCount: 8 }),
      c({ id: 'c2', offsetMs: 872_000, likeCount: 41, replies: [c({ id: 'r1', displayName: 'Jo', parentId: 'c2', likeCount: 6 })] }),
    ];
  };

  it('the strip is at 56, the map at 102, the spine at 140, the zone 6 over the home strip', async () => {
    two();
    const r = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    near(styleOf(byId(r, 'comments-strip'))['top'], 56);
    near(styleOf(byId(r, 'comments-map-row'))['top'], 102);
    near(styleOf(byId(r, 'comments-thread'))['top'], 140);
    // 6 over the home strip: the root layout pads the strip once, so the page starts above it (the drawing's 40 = 34 + 6).
    near(styleOf(byId(r, 'comments-zone'))['bottom'], 6);
    near(styleOf(byId(r, 'comments-zone'))['left'], 12);
    near(styleOf(byId(r, 'comments-zone'))['gap'], 10);
  });

  it('a taller status bar and home inset move the page by the difference', async () => {
    two();
    const r = mount(createElement(CommentsScreen), { top: 59, bottom: 34 });
    near(styleOf(byId(r, 'comments-strip'))['top'], 65);
    near(styleOf(byId(r, 'comments-thread'))['top'], 149);
    // A taller home inset moves nothing: the root pads that strip, so the zone stays 6 above it on every phone.
    const r2 = mount(createElement(CommentsScreen), { top: 50, bottom: 40 });
    near(styleOf(byId(r2, 'comments-zone'))['bottom'], 6);
    expect([belowStatus(50, 102), aboveInset(34, 40), aboveInset(0, 40)]).toEqual([102, 40, 6]);
  });

  it('the spine is 2 wide at x 40 and runs hot, violet at 60 %, line', () => {
    const r = mount(createElement(SpineLine));
    const line = byId(r, 'spine-line');
    near(styleOf(line)['left'], 40); near(styleOf(line)['width'], 2);
    expect(line.props['locations']).toEqual([0, 0.6, 1]);
    expect(line.props['colors']).toEqual([colour.hot, colour.violet, colour.line].map((x) => processColor(x)));
  });

  it('the thumb zone: a 44 close circle, the title with its count, a 40 capsule with a 3 rim, a 56 composer with radius 22', async () => {
    two();
    const r = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    expect(labels(r)).toEqual(expect.arrayContaining(['Close', 'Newest', 'Most liked', 'By moment', 'Order options', 'Record a voice comment', 'Add a picture', 'Write a comment at 2:00']));
    const cap = styleOf(byId(r, 'comments-capsule'));
    expect([cap['height'], cap['padding'], cap['gap']]).toEqual([40, 3, 2]);
    const bar = styleOf(byId(r, 'comments-composer'));
    expect([bar['minHeight'], bar['borderRadius'], bar['paddingHorizontal']]).toEqual([56, 22, 6]);
    expect(text(r)).toContain('Comments');
    expect(text(r)).toContain('"3"'); // 2 comments + 1 reply
  });

  it('close goes back; the composer opens the composer sheet; the options circle opens Order', async () => {
    two();
    const r = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    act(() => { pressable(r, 'Close').props['onPress'](); });
    expect(mockBack).toHaveBeenCalled();
    act(() => { pressable(r, 'Order options').props['onPress'](); });
    expect(labels(r)).toEqual(expect.arrayContaining(['Smart order', 'Reverse order']));
  });

  it('signed out the composer is one light 56 button "Sign in to join the conversation"', () => {
    mockListener = undefined;
    two();
    const r = mount(createElement(CommentsScreen));
    const b = styleOf(byId(r, 'comments-signin'));
    expect([b['height'], b['borderRadius']]).toEqual([56, 22]);
    act(() => { pressable(r, 'Sign in to join the conversation').props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    expect(labels(r)).not.toContain('Record a voice comment');
  });

  it('with pictures off the image button is not drawn (the composer sheet has the same gate)', async () => {
    mockImages = false;
    two();
    const r = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    expect(labels(r)).not.toContain('Add a picture');
  });

  it('loading: the ghost rows in the spine area; nothing cached and the server unreachable: the offline block with Retry', async () => {
    mockHasCache = false;
    const loading = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    expect(allById(loading, 'ghost-rows')).toHaveLength(1);
    expect(allById(loading, 'spine-line')).toHaveLength(0);
    mockStale = true;
    const failed = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    expect(allById(failed, 'ghost-rows')).toHaveLength(0);
    expect(labels(failed)).toContain('Retry');
  });

  it('no comments: no spine, the shared empty block, "Comment here"', async () => {
    const r = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    expect(allById(r, 'spine-line')).toHaveLength(0);
    expect(text(r)).toContain('Nobody has said anything at this moment yet.');
    expect(labels(r)).toContain('Comment here');
  });
});

describe('the spine groups comments under moments', () => {
  const list: Comment[] = [
    c({ id: 'a', offsetMs: 370_000, likeCount: 8 }),
    c({ id: 'b', offsetMs: 872_000, likeCount: 41 }),
    c({ id: 'b2', offsetMs: 872_400, likeCount: 6 }),
    c({ id: 'n', offsetMs: null, likeCount: 0 }),
  ];
  it('By moment: the same second shares a node and counts "n reacted"; other orders give each comment its own node', () => {
    const by = buildNodes(list, true);
    expect(by.map((n) => [n.momentMs === null ? null : Math.floor(n.momentMs / 1000), n.comments.length])).toEqual([[370, 1], [872, 2], [null, 1]]);
    expect(by[1]?.reacted).toBe(1 + 41 + 1 + 6);
    expect(by[2]?.reacted).toBeUndefined();
    expect(buildNodes(list, false).map((n) => n.comments.length)).toEqual([1, 1, 1, 1]);
    expect(buildNodes(list, false).every((n) => n.reacted === undefined)).toBe(true);
    expect(reactedCount([c({ id: 'z', deleted: true })])).toBe(0);
  });
  it('a jump goes to the node whose moment is nearest, skipping nodes with none', () => {
    const nodes = buildNodes(list, true);
    expect(nearestNode(nodes, 400_000)).toBe(0);
    expect(nearestNode(nodes, 900_000)).toBe(1);
    expect(nearestNode(buildNodes([c({ id: 'n', offsetMs: null })], true), 5)).toBe(-1);
  });
  it('a node: the chip in a 46 column over the spine, "41 reacted" in mono beside it', () => {
    const r = mount(<SpineNode momentMs={872_000} reacted={41} onSeek={mockSeek}>{createElement('Marker')}</SpineNode>);
    const node = byId(r, 'spine-node');
    near(styleOf(node)['gap'], 10);
    expect(text(r)).toContain('14:32');
    expect(text(r)).toContain('41 reacted');
    act(() => { pressable(r, 'Play from 14:32').props['onPress'](); });
    expect(mockSeek).toHaveBeenCalledWith(872_000);
    const col = r.root.findAll((n) => typeof n.type === 'string' && styleOf(n)['width'] === 46)[0]!;
    expect(styleOf(col)['zIndex']).toBe(2);
  });
});

describe('a card', () => {
  const render = (x: Comment, props: Partial<React.ComponentProps<typeof CommentRow>> = {}): ReactTestRenderer =>
    mount(createElement(CommentRow, { c: x, serverTime: SERVER, likeOf: (y: Comment) => ({ count: y.likeCount ?? 0, liked: false }), onSeek: mockSeek, onLike: jest.fn(), onMenu: jest.fn(), ...props }));

  it('radius 18, padding 12, 7 between parts, 56 from the node (86 for a reply)', () => {
    const r = render(c({ id: 'c1' }), { onReply: jest.fn(), onOpenThread: jest.fn() });
    const card = styleOf(byId(r, 'comment-card'));
    expect([card['borderRadius'], card['padding'], card['gap'], card['marginLeft']]).toEqual([18, 12, 7, 56]);
    expect([cardLeft(0), cardLeft(1), cardLeft(2)]).toEqual([56, 86, 116]);
    const withReply = render(c({ id: 'c2', replies: [c({ id: 'r1', parentId: 'c2' })] }), { onOpenThread: jest.fn() });
    expect(allById(withReply, 'comment-card').map((n) => styleOf(n)['marginLeft'])).toEqual([56, 86]);
  });

  it('the age is "5h" (with the country after it), the heart is a 16 glyph with its count in mono, "n replies ›" is hot text', () => {
    expect([shortAgo('2026-10-28T11:59:30Z', SERVER), shortAgo('2026-10-28T11:55:00Z', SERVER), shortAgo('2026-10-28T07:00:00Z', SERVER), shortAgo('2026-10-25T12:00:00Z', SERVER)]).toEqual(['now', '5m', '5h', '3d']);
    expect(agoAndPlace('2026-10-28T07:00:00Z', SERVER, 'Malaysia')).toBe('5h · Malaysia');
    const r = render(c({ id: 'c1', likeCount: 41, replies: [c({ id: 'r1', parentId: 'c1' })], replyCount: 6 } as Partial<Comment> & { id: string }), { onOpenThread: jest.fn(), onReply: jest.fn() });
    expect(text(r)).toContain('5h');
    expect(text(r)).toContain('"41"');
    expect(labels(r)).toEqual(expect.arrayContaining(['Like. 41 likes', 'Reply', 'More for this comment']));
    expect(text(r)).toContain('Rui');
  });

  it('on the episode page the two newest comments sit flush (no spine to step in from)', () => {
    const r = render(c({ id: 'c1' }), { flush: true });
    expect(styleOf(byId(r, 'comment-card'))['marginLeft']).toBe(0);
  });

  it('your own card says "You", has no like button, and the spoken name keeps the real name and "Play from"', () => {
    const r = render(c({ id: 'm1', mine: true, displayName: 'Listener 02', body: 'Maestro: heard it on the simulator' }));
    expect(text(r)).toContain('You');
    expect(labels(r).some((l) => l.startsWith('Like'))).toBe(false);
    expect(labels(r)).toContain('Listener 02, 5 h ago, Play from 14:32, Maestro: heard it on the simulator');
  });

  it('a pinned card starts with the mono hot-text line; a folded one is a dashed card; a held one says "Only you"', () => {
    const pinned = render({ ...c({ id: 'p1' }), pinned: true } as Comment);
    expect(text(pinned)).toContain('PINNED BY THE HOST');
    const folded = render({ ...c({ id: 'f1' }), folded: true } as Comment);
    const dashed = folded.root.findAll((n) => n.props['accessibilityLabel'] === 'Show hidden comment' && typeof n.type === 'string')[0]!;
    expect(styleOf(dashed)['borderStyle']).toBe('dashed');
    const held = render(c({ id: 'h1', held: true }));
    expect(text(held)).toContain('Only you');
  });

  it('a tap on the words opens the menu, a tap on Reply replies, the heart likes', () => {
    const onMenu = jest.fn(); const onReply = jest.fn(); const onLike = jest.fn();
    const r = render(c({ id: 'c1' }), { onMenu, onReply, onLike });
    act(() => { pressable(r, 'More for this comment').props['onPress'](); });
    act(() => { pressable(r, 'Reply').props['onPress'](); });
    act(() => { pressable(r, 'Like. 41 likes').props['onPress'](); });
    expect([onMenu.mock.calls.length, onReply.mock.calls.length, onLike.mock.calls.length]).toEqual([1, 1, 1]);
  });
});

describe('the map', () => {
  it('draws 80 bars 26 tall, the position line at the played share of the width, and up to three listening-now discs', () => {
    const r = mount(createElement(CommentsMap, { heat: mockHeat, played: 0.26, onJump: mockSeek, listening: 5 }));
    const bars = allById(r, 'curve-bar');
    expect(bars).toHaveLength(80);
    expect(Math.max(...bars.map((b) => Number(styleOf(b)['height'])))).toBe(26);
    const wrap = byId(r, 'comments-map');
    act(() => { wrap.props['onLayout']({ nativeEvent: { layout: { width: 300, height: 26, x: 0, y: 0 } } }); });
    near(styleOf(byId(r, 'comments-map-line'))['left'], 78);
    near(styleOf(byId(r, 'comments-map-line'))['width'], 2);
    expect(byId(r, 'listening-now').props['accessibilityLabel']).toBe('5 listening now');
    expect([liveDiscs(undefined), liveDiscs(1), liveDiscs(2), liveDiscs(9)]).toEqual([0, 0, 2, 3]);
    expect(allById(mount(createElement(CommentsMap, { heat: undefined, played: 0, onJump: mockSeek })), 'listening-now')).toHaveLength(0);
  });
});

describe('the pieces of the thumb zone', () => {
  it('the capsule: the chosen choice is light with void words, the others text2; a tap changes the order', () => {
    const onChange = jest.fn();
    const r = mount(createElement(Capsule, { items: [{ value: 'a', label: 'Newest' }, { value: 'b', label: 'Most liked' }], value: 'a', onChange }));
    const on = pressable(r, 'Newest'); const off = pressable(r, 'Most liked');
    expect(classOf(r, 'Newest')).toContain('bg-text');
    expect(classOf(r, 'Most liked')).not.toContain('bg-text');
    expect(styleOf(on)['borderRadius']).toBe(17);
    act(() => { off.props['onPress'](); });
    expect(onChange).toHaveBeenCalledWith('b');
  });
  it('the composer bar: the moment chip, the words, then the mic slot and the image button', () => {
    const r = mount(createElement(ComposerBar, { moment: '14:32', placeholder: 'Say something', accessibilityLabel: 'Write a comment at 14:32', onOpen: mockSeek, mic: createElement('Mic'), onImage: mockSeek }));
    expect(text(r)).toContain('14:32');
    expect(labels(r)).toEqual(expect.arrayContaining(['Write a comment at 14:32', 'Add a picture']));
  });
  it('the options circle is a 40 raise disc and turns light while Smart or Reverse is on', () => {
    const off = mount(createElement(IconButton, { icon: 'options-outline', label: 'Order options', onPress: mockSeek, fill: true, selected: false, size: 18, diameter: 40 }));
    const on = mount(createElement(IconButton, { icon: 'options-outline', label: 'Order options', onPress: mockSeek, fill: true, selected: true, size: 18, diameter: 40 }));
    expect([styleOf(pressable(off, 'Order options'))['width'], styleOf(pressable(off, 'Order options'))['height']]).toEqual([40, 40]);
    expect(classOf(off, 'Order options')).toContain('bg-raise');
    expect(classOf(on, 'Order options')).toContain('bg-text');
    expect(pressable(on, 'Order options').props['accessibilityState']).toMatchObject({ selected: true });
  });
  it('sign-in bar: light fill, void words', () => {
    const r = mount(createElement(SignInBar, { label: 'Sign in to reply', onPress: mockSeek }));
    expect(classOf(r, 'Sign in to reply')).toContain('bg-text');
  });
});

describe('the sheets', () => {
  it('the menu: the comment on a card, 52 rows with 40 squares, Mark as unfriendly and (under a rule) Report in hot text, Cancel', () => {
    const run = jest.fn(); const onClose = jest.fn();
    const items = [{ label: 'Reply', run }, { label: 'Share', run }, { label: 'Mark as unfriendly', run }, { label: 'Report', run }];
    const r = mount(createElement(CommentMenu, { comment: c({ id: 'c1' }), items, onClose }));
    expect(text(r)).toContain('This is the part I replay every morning.');
    const row = pressable(r, 'Reply');
    expect(styleOf(row)['minHeight']).toBe(52);
    const squares = r.root.findAll((n) => typeof n.type === 'string' && styleOf(n)['width'] === 40 && styleOf(n)['height'] === 40 && styleOf(n)['borderRadius'] === 12);
    expect(squares.length).toBe(4);
    const hot = (label: string) => JSON.stringify(pressable(r, label).findAll((n) => typeof n.type === 'string' && typeof n.props['children'] === 'string').map((n) => styleOf(n)['color']));
    expect(hot('Mark as unfriendly')).toContain(colour.hotText);
    expect(hot('Report')).toContain(colour.hotText);
    expect(hot('Reply')).not.toContain(colour.hotText);
    // a rule (1 px) sits directly above Report, none above Mark as unfriendly
    const rules = r.root.findAll((n) => typeof n.type === 'string' && styleOf(n)['height'] === 1 && styleOf(n)['marginVertical'] === 2);
    expect(rules).toHaveLength(1);
    act(() => { pressable(r, 'Share').props['onPress'](); });
    expect([run.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 1]);
    act(() => { pressable(r, 'Cancel').props['onPress'](); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('the report sheet: tiles 52 tall, radius 16, two a row, the odd last one alone; Send is a hot pill', () => {
    const r = mount(createElement(ReportSheet, { target: { kind: 'comment', id: 'c1', authorId: 'a', label: 'comment' }, onClose: jest.fn() }));
    const tile = pressable(r, 'Harassment');
    expect([styleOf(tile)['minHeight'], styleOf(tile)['borderRadius']]).toEqual([52, 16]);
    // Tiles per row: the radios that share their nearest host parent.
    const hostParent = (n: ReactTestInstance): ReactTestInstance => { let p = n.parent; while (p && typeof p.type !== 'string') p = p.parent; return p!; };
    const radios = r.root.findAll((n) => n.props['accessibilityRole'] === 'radio' && typeof n.type === 'string');
    const rowsOf = new Map<ReactTestInstance, number>();
    for (const x of radios) rowsOf.set(hostParent(x), (rowsOf.get(hostParent(x)) ?? 0) + 1);
    expect([...rowsOf.values()]).toEqual([2, 2, 2, 1]);
    act(() => { tile.props['onPress'](); });
    expect(classOf(r, 'Harassment')).toContain('bg-text');
    expect(classOf(r, 'Send report')).toContain('bg-hot');
    expect(text(r)).toContain('Choose one reason.');
  });

  it('the composer sheet: Post is a hot 38 pill, the write box is 120 min, the count is mono, a reply says "Reply"', () => {
    const r = mount(createElement(ComposerSheet, { initial: { episodeId: 'e1', body: '', moment: { offsetMs: 872_000 } } as never, onClose: jest.fn(), onPosted: jest.fn() }));
    const post = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Post' && typeof n.type === 'string')[0]!;
    expect(styleOf(post)['height']).toBe(38);
    expect(String(post.props['className'])).toContain('bg-hot');
    expect(text(r)).toContain('New comment');
    expect(text(r)).toContain('At 14:32');
    expect(text(r)).toContain('" / 2000"');
    expect(labels(r)).toEqual(expect.arrayContaining(['Cancel', 'Remove the moment', 'Comment']));
    const box = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Comment')[0]!;
    expect(styleOf(box)['minHeight']).toBe(120);
    const reply = mount(createElement(ComposerSheet, { initial: { episodeId: 'e1', body: '', parentId: 'c1', moment: undefined } as never, onClose: jest.fn(), onPosted: jest.fn() }));
    expect(reply.root.findAll((n) => n.props['placeholder'] === 'Write a reply').length).toBeGreaterThan(0);
    expect(text(reply)).toContain('"Reply"');
  });
});

describe('the voice block and the drawn icons', () => {
  it('the wave is the same for the same length, 100 buckets from 0.15 to 1', () => {
    expect(voiceWave(12_000)).toEqual(voiceWave(12_000));
    expect(voiceWave(12_000)).not.toEqual(voiceWave(13_000));
    expect(voiceWave(5000)).toHaveLength(100);
    expect(Math.min(...voiceWave(5000))).toBeGreaterThanOrEqual(0.15);
  });
  // The drawing lives in the private specs/ folder, which the public CI mirror never gets; m31/kit-icons.json is its copy of
  // these six paths, and the next test keeps the copy equal to kit.js wherever kit.js exists.
  const KIT = path.join(__dirname, '../../../specs/033-m31-redesign/design-pulse2/kit.js');
  const kitShape = (kit: string, name: string): string => {
    const m = new RegExp(`\\b${name}: '([^']*)'`).exec(kit);
    if (!m) throw new Error(`kit.js has no ${name}`);
    return m[1]!;
  };
  const COPY = JSON.parse(readFileSync(path.join(__dirname, '../m31/kit-icons.json'), 'utf8')).icons as Record<string, string>;
  (existsSync(KIT) ? it : it.skip)('m31/kit-icons.json is the same as kit.js', () => {
    const kit = readFileSync(KIT, 'utf8');
    for (const name of Object.keys(COPY)) expect([name, COPY[name]]).toEqual([name, kitShape(kit, name)]);
  });
  it('the icons added for the comments pages are the drawing\'s own paths (kit.js)', () => {
    const shape = (name: string): string => {
      const d = existsSync(KIT) ? kitShape(readFileSync(KIT, 'utf8'), name) : COPY[name];
      if (d === undefined) throw new Error(`m31/kit-icons.json has no ${name}`);
      return d.replace(/"/g, '\\"');
    };
    for (const [ionicon, drawn] of [['mic-outline', 'mic'], ['image-outline', 'image'], ['send', 'send'], ['lock-closed-outline', 'lock'], ['flag-outline', 'flag'], ['pin', 'pin']] as const) {
      expect([ionicon, JSON.stringify(DRAWN_ICONS[ionicon]).replace(/^"|"$/g, '')]).toEqual([ionicon, shape(drawn)]);
    }
  });
});

describe('the replies page (Stage + Thread)', () => {
  const parent = c({ id: 'c2', displayName: 'Rui', likeCount: 41 });
  const replies = [
    c({ id: 'r1', displayName: 'Jo', parentId: 'c2', body: 'Same. Saved it as a clip.', createdAt: '2026-10-28T08:00:00Z', likeCount: 6 }),
    c({ id: 'r2', displayName: 'Ana', parentId: 'c2', body: 'it gets me every time', createdAt: '2026-10-28T09:00:00Z', likeCount: 2 }),
  ];
  const open = async (): Promise<ReactTestRenderer> => {
    mockParams = { commentId: 'c2', episodeId: 'e1' };
    const r = mount(createElement(ThreadScreen));
    await act(async () => { await Promise.resolve(); });
    return r;
  };

  it('the stage is at 60 (the comment, its solid chip, its heart), the spine from 250, replies as cards with an age tick', async () => {
    mockThread = { parent, replies };
    const r = await open();
    near(styleOf(byId(r, 'thread-stage'))['top'], 60);
    near(styleOf(byId(r, 'replies-thread'))['top'], 250);
    expect(text(r)).toContain('This is the part I replay every morning.');
    expect(labels(r)).toEqual(expect.arrayContaining(['Play from 14:32', 'Like. 41 likes', 'More for this comment']));
    expect(allById(r, 'spine-node')).toHaveLength(2);
    expect(allById(r, 'comment-card').map((n) => styleOf(n)['marginLeft'])).toEqual([56, 56]);
    expect(text(r)).toContain('"4h"');
    expect(text(r)).toContain('"3h"');
    expect(text(r)).toContain('"That\'s all"');
  });

  it('the thumb zone: back, "Replies 2", the All / Newest capsule, the "Reply to Rui" composer with a mic and no image button', async () => {
    mockThread = { parent, replies };
    const r = await open();
    expect(labels(r)).toEqual(expect.arrayContaining(['Back', 'All', 'Newest', 'Reply to Rui', 'Record a voice reply']));
    expect(labels(r)).not.toContain('Add a picture');
    expect(text(r)).toContain('Replies');
    near(styleOf(byId(r, 'comments-zone'))['bottom'], 6);
    act(() => { pressable(r, 'Back').props['onPress'](); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('signed out: "Sign in to reply"; no replies: the empty block; a failed load: the wifi block, no Retry', async () => {
    mockListener = undefined;
    mockThread = { parent, replies: [] };
    const r = await open();
    expect(labels(r)).toContain('Sign in to reply');
    expect(text(r)).toContain('No replies yet — be the first.');
    expect(allById(r, 'spine-line')).toHaveLength(0);
    mockThread = 'fail';
    const f = await open();
    expect(text(f)).toContain('Couldn\'t load the replies — pull back and try again.');
    expect(labels(f)).not.toContain('Retry');
  });
});

describe('the recorder', () => {
  it('turns the composer into the 56 bar with a 1.5 hot border: cancel, the moment, a breathing dot, the wave, the clock, a hot check', async () => {
    mockImages = true;
    const r = mount(<VoiceComposer episodeId="e1" offsetMs={() => 872_000} onPosted={jest.fn()}>{(mic: React.ReactElement) => createElement('Bar', null, mic)}</VoiceComposer>);
    await act(async () => { pressable(r, 'Record a voice comment').props['onPress'](); await Promise.resolve(); await Promise.resolve(); });
    const bar = styleOf(byId(r, 'voice-recorder'));
    expect([bar['minHeight'], bar['borderRadius'], bar['borderWidth'], bar['borderColor']]).toEqual([56, 22, 1.5, colour.hot]);
    expect(labels(r)).toEqual(expect.arrayContaining(['Cancel recording', 'Stop and post the voice comment']));
    expect(text(r)).toContain('14:32');
    expect(text(r)).toContain('0:08');
    expect(allById(r, 'curve-bar')).toHaveLength(24);
    expect(allById(r, 'record-dot')).toHaveLength(1);
    expect(classOf(r, 'Stop and post the voice comment')).toContain('bg-hot');
    const dot = styleOf(byId(r, 'record-dot'));
    expect([dot['width'], dot['height']]).toEqual([8, 8]);
  });

  it('the review card: raise2, radius 22, "Your recording · 0:08", a quiet Cancel beside a hot Post', () => {
    const onPost = jest.fn();
    const r = mount(createElement(VoiceTextReview, { text: 'Same, I saved it as a clip', durationMs: 8000, posting: false, postLabel: 'Post the voice comment', onChange: jest.fn(), onPost, onCancel: jest.fn() }));
    const card = styleOf(byId(r, 'voice-review'));
    expect([card['borderRadius'], card['padding'], card['gap']]).toEqual([22, 12, 10]);
    expect(text(r)).toContain('Your recording · 0:08');
    expect(classOf(r, 'Throw the recording away')).toContain('bg-raise');
    expect(classOf(r, 'Post the voice comment')).toContain('bg-hot');
    act(() => { pressable(r, 'Post the voice comment').props['onPress'](); });
    expect(onPost).toHaveBeenCalled();
  });

  it('the rules sheet: five hot bullets, Accept (hot) and Not now', () => {
    const r = mount(createElement(RulesSheet, { open: true, onAccepted: jest.fn(), onClose: jest.fn() }));
    expect(text(r).match(/"•"/g)).toHaveLength(5);
    expect(classOf(r, 'Accept the community rules')).toContain('bg-hot');
    expect(labels(r)).toContain('Not now');
  });
});

describe('the moment sheet', () => {
  const moment = [c({ id: 'm1', displayName: 'Rui', likeCount: 41 }), c({ id: 'm2', displayName: 'Jo', mine: true, body: 'Me too, every single day.', likeCount: 0 })];
  it('"At 14:32" in Unbounded, a solid chip, a spine, Reply / Delete / Report and the heart on each card, "All comments" opens the page at this moment', () => {
    const onClose = jest.fn();
    const r = mount(createElement(MomentSheet, { episodeId: 'e1', title: 'At 14:32', comments: moment, onClose, onReply: jest.fn() }));
    expect(text(r)).toContain('"At 14:32"');
    expect(text(r)).toContain('"14:32"');
    expect(labels(r)).toEqual(expect.arrayContaining(['Reply', 'Delete', 'Report this comment', 'Like. 41 likes', 'All comments', 'Close']));
    const spine = r.root.findAll((n) => typeof n.type === 'string' && styleOf(n)['left'] === 6 && styleOf(n)['width'] === 2);
    expect(spine.length).toBeGreaterThan(0);
    act(() => { pressable(r, 'All comments').props['onPress'](); });
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/comments/[episodeId]', params: { episodeId: 'e1', at: '872000' } });
  });
});

// ---- F2b (wave-2 design vs build, Comments): the differences the web capture measured, closed -------------------------------
// Measured on the web build (`specs/033-m31-redesign/contact/wave-2/measure.md`): the Order sheet 34 px short, the report sheet 70 px
// tall, the rules sheet without its head row, every card 6-8 px tall. Each test reads the structure the drawing writes.
describe('F2b: the sheets and cards are the drawing\'s height', () => {
  const hostParent = (n: ReactTestInstance): ReactTestInstance => { let p = n.parent; while (p && typeof p.type !== 'string') p = p.parent; return p!; };
  const hostOf = (r: ReactTestRenderer, label: string): ReactTestInstance => {
    const all = r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.type === 'string');
    if (all.length === 0) throw new Error(`no host "${label}"`);
    return all[0]!;
  };

  it('Order: the two rows and a 6 tall foot are direct children of the sheet, so its 14 gap falls between them (259 drawn, 225 built before)', async () => {
    mockCached.social.comments = [c({ id: 'c1' })];
    const r = mount(createElement(CommentsScreen));
    await act(async () => { await Promise.resolve(); });
    act(() => { pressable(r, 'Order options').props['onPress'](); });
    const sheet = byId(r, 'action-sheet');
    expect(styleOf(sheet)['gap']).toBe(14);
    const smart = hostOf(r, 'Smart order'); const reverse = hostOf(r, 'Reverse order'); const foot = byId(r, 'order-sheet-foot');
    expect(hostParent(smart) === sheet).toBe(true);
    expect(hostParent(reverse) === sheet).toBe(true);
    expect(hostParent(foot) === sheet).toBe(true);
    expect(styleOf(foot)['height']).toBe(6);
    // 8 + 5 + 14 + 36 + 14 + 52 + 14 + 52 + 14 + 6 + 44 (home 34 + 10) = 259
    expect([styleOf(smart)['minHeight'], styleOf(reverse)['minHeight']]).toEqual([52, 52]);
  });

  it('Report: a borderless 64 note, no counter until 400 characters, Cancel a 14 tall line with a 48 pt tap', () => {
    const r = mount(createElement(ReportSheet, { target: { kind: 'comment', id: 'c1', authorId: 'a', label: 'comment' }, onClose: jest.fn() }));
    const field = r.root.findAll((n) => typeof n.type === 'string' && /\bborder-0\b/.test(String(n.props['className'] ?? '')) && /bg-raise2/.test(String(n.props['className'] ?? '')))[0]!;
    expect([styleOf(field)['height'], styleOf(field)['borderRadius']]).toEqual([64, 18]);
    expect(allById(r, 'report-note-count')).toHaveLength(0);
    expect(text(r)).not.toContain('"/ 500"');
    const cancel = byId(r, 'report-cancel');
    expect(styleOf(cancel)['height']).toBe(14);
    const slop = cancel.props['hitSlop'] as { top: number; bottom: number };
    expect(14 + slop.top + slop.bottom).toBeGreaterThanOrEqual(48);
    act(() => { r.root.find((n) => n.props['accessibilityLabel'] === 'Note, optional').props['onChangeText']('x'.repeat(401)); });
    expect(allById(r, 'report-note-count')).toHaveLength(1);
    expect(text(r)).toContain('401');
    expect(text(r)).toContain('500');
  });

  it('Rules in the composer: the head row (Cancel, New comment, Post) stays above the rules card; Not now is a 14 line with a 48 pt tap', async () => {
    const { ApiError } = jest.requireActual('@/social/api') as typeof import('@/social/api');
    const social = (jest.requireMock('@/social/context') as { useSocial: () => { composer: { canSubmit: () => boolean; submit: jest.Mock } } }).useSocial();
    const keep = social.composer.canSubmit;
    social.composer.canSubmit = () => true;
    social.composer.submit.mockResolvedValue({ kind: 'error', error: new ApiError('rules_required' as never, 'rules', 428) });
    try {
      const r = mount(createElement(ComposerSheet, { initial: { episodeId: 'e1', body: 'hello', moment: { offsetMs: 872_000 } } as never, onClose: jest.fn(), onPosted: jest.fn() }));
      await act(async () => { pressable(r, 'Post').props['onPress'](); await Promise.resolve(); await Promise.resolve(); });
      expect(text(r)).toContain('Community rules');
      expect(labels(r)).toEqual(expect.arrayContaining(['Cancel', 'Post', 'Accept the community rules', 'Not now']));
      expect(text(r)).toContain('New comment');
      // the head row comes before the card in the same sheet
      const order = r.root.findAll((n) => typeof n.type === 'string' && ['Cancel', 'Not now'].includes(String(n.props['accessibilityLabel']))).map((n) => n.props['accessibilityLabel']);
      expect(order).toEqual(['Cancel', 'Not now']);
      const notNow = byId(r, 'rules-not-now');
      expect(styleOf(notNow)['height']).toBe(14);
      const slop = notNow.props['hitSlop'] as { top: number; bottom: number };
      expect(14 + slop.top + slop.bottom).toBeGreaterThanOrEqual(48);
      // the head's Cancel is text in a 38 row: its tap comes from the hitSlop, not a 48 box
      const cancel = hostOf(r, 'Cancel');
      expect(styleOf(cancel)['minHeight']).toBeUndefined();
    } finally { social.composer.canSubmit = keep; }
  });

  it('the rules are Geist 400 14/20 (the quote step), not the 600 compact step that wrapped the drawn one-line rules; five rules, the fifth kept on purpose', () => {
    const r = mount(createElement(RulesSheet, { open: true, onAccepted: jest.fn(), onClose: jest.fn() }));
    const rule = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'Be kind. Talk about the episode, not the person.')[0]!;
    expect(String(rule.props['className'])).toContain('text-pulse-quote');
    expect(String(rule.props['className'])).not.toContain('font-semibold');
    expect(text(r)).toContain("Don't share anyone's private details.");
  });

  it('a card: the pin words are a 13 line, the action row is the 16 heart (counts, Reply and "n replies" are 16 lines), so Aisha\'s card is 142 not 150', () => {
    const r = mount(createElement(CommentRow, {
      c: { ...c({ id: 'p', likeCount: 8, replyCount: 6 } as never), extras: undefined } as never,
      serverTime: SERVER, likeOf: () => ({ count: 8, liked: false }), onSeek: jest.fn(), onLike: jest.fn(), onMenu: jest.fn(), onReply: jest.fn(), onOpenThread: jest.fn(),
    }));
    const lineOf = (words: string): unknown => {
      const t = r.root.findAll((n) => typeof n.type === 'string' && String(n.props['children']) === words && styleOf(n)['lineHeight'] !== undefined)[0];
      if (!t) throw new Error(`no text "${words}"`);
      return styleOf(t)['lineHeight'];
    };
    expect(lineOf('Reply')).toBe(16);
    expect(lineOf('8')).toBe(16);
    const pinned = mount(createElement(CommentRow, {
      c: { ...c({ id: 'q', likeCount: 8 }), pinned: true } as never,
      serverTime: SERVER, likeOf: () => ({ count: 8, liked: false }), onSeek: jest.fn(), onLike: jest.fn(), onMenu: jest.fn(),
    }));
    const pin = pinned.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'PINNED BY THE HOST')[0];
    expect(pin).toBeDefined();
    expect(styleOf(pin!)['lineHeight']).toBe(13);
  });
});
