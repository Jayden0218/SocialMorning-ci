// Tests the social lane's leftovers: the Clips deck, the Follow / Block pills, the status rail and its chooser, and the muted-threads group.
/**
 * M31 W4-D (T053; design-pulse2 `episode--screen` Clips, `episode--clips-empty`, `profile--screen` bottom zone, `profile--blocked`,
 * `voice-posts--chooser-sheet`, `voice-posts--delete-dialog`, `muted-threads--toast`). In Jest only; how it looks on a phone is NOT VERIFIED.
 *
 * The breaks that turn it red (each tried once): in ClipCard set the card `height: 140`; drop `onLongPress`; in ClipList draw `EmptyState`
 * instead of `EmptyDeck`; in FollowButton make `kind` always `'hot'`; in BlockButton drop the `bar` label's name; in VoicePosts make RAIL.circle 64
 * or put back the old `Actionsheet`; in MutedThreads draw `Card` (not `PanelGroup`).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockToast = jest.fn();
const mockPush = jest.fn();
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Me' };
const mockFollow = jest.fn(() => Promise.resolve());
const mockMuted = jest.fn();
const mockUnmute = jest.fn(() => Promise.resolve());
const mockBlock = jest.fn(() => 'ok');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
  useFocusEffect: () => undefined,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/shell/providers', () => ({ useToast: () => mockToast, useStores: () => ({}) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { follow: mockFollow, unfollow: mockFollow, deleteClip: jest.fn(() => Promise.resolve()) }, listener: mockListener }) }));
jest.mock('@/safety/context', () => ({
  announce: jest.fn(),
  useSafety: () => { const safety = { isBlocked: () => false, block: mockBlock, unblock: jest.fn(), clips: (c: unknown[]) => c }; return { version: 0, safety, ...safety }; },
}));
jest.mock('@/social/api-m22-social', () => {
  // One object for every render: the components list it as an effect dependency.
  const api = { mutedThreads: () => mockMuted(), unmuteThread: (...a: unknown[]) => mockUnmute(...(a as [])), statuses: () => Promise.resolve([]) };
  return { useM22SocialApi: () => api };
});
const mockClips = jest.fn();
jest.mock('@/graph/context', () => ({ useGraph: () => ({ useEpisodeClips: () => mockClips() }) }));
jest.mock('@/playback/store', () => ({ usePlayer: () => ({ playClip: jest.fn() }) }));
jest.mock('@/graph/share', () => ({ shareClip: jest.fn() }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useClipVideoRows: () => () => [], useSharePanel: () => [jest.fn(), null] }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));

import { ClipCard } from '@/ui/clips/ClipCard';
import { ClipList } from '@/ui/clips/ClipList';
import { FollowButton } from '@/ui/social/FollowButton';
import { BlockButton } from '@/ui/social/BlockButton';
import { VoicePosts } from '@/ui/social/VoicePosts';
import { MutedThreads } from '@/ui/social/MutedThreads';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { episode, colour } from '@/design/tokens';

const HOT = `"backgroundColor":"${colour.hot}"`;
const RAISE = `"backgroundColor":"${colour.raise}"`;
import type { Clip } from '@/social/api';

const rendered: ReactTestRenderer[] = [];
async function mount(node: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, node)); });
  rendered.push(r);
  return r;
}
const hosts = (r: ReactTestRenderer, pred: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && pred(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const n = hosts(r, (x) => x.props['testID'] === id)[0];
  if (!n) throw new Error(`no testID "${id}"`);
  return n;
};
const style = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

const clip: Clip = { id: 'c1', author: { id: 'u1', displayName: 'Rui' }, episodeId: 'e1', startMs: 722_000, endMs: 752_000, caption: null, createdAt: '2026-10-01T00:00:00Z', deleted: false } as unknown as Clip;

beforeEach(() => { jest.useFakeTimers(); setReducedMotionForTest(true); mockToast.mockClear(); mockPush.mockClear(); mockListener = { listenerId: 'me', displayName: 'Me' }; });
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 50 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

describe('the Clips deck card', () => {
  it('is 200 x 120 with a radius of 20, the range in the solid chip and the author under it', async () => {
    const r = await mount(<ClipCard clip={clip} onPlay={jest.fn()} />);
    const card = style(byId(r, 'clip-card'));
    expect([card['width'], card['height'], card['borderRadius']]).toEqual([episode.clipCard.width, episode.clipCard.height, episode.clipCard.radius]);
    expect(text(r)).toContain('12:02 – 12:32');
    expect(text(r)).toContain('by Rui');
    expect(text(r)).toContain('play-dot');
  });
  it('plays on a tap and keeps Share, Delete and Report behind a long-press', async () => {
    const onPlay = jest.fn(); const onShare = jest.fn(); const onReport = jest.fn();
    const r = await mount(<ClipCard clip={clip} onPlay={onPlay} onShare={onShare} onReport={onReport} />);
    const play = byLabel(r, 'Clip 12:02 to 12:32')!;
    act(() => { play.props['onPress'](); });
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(byLabel(r, 'Share this clip')).toBeUndefined();
    act(() => { play.props['onLongPress'](); });
    act(() => { jest.runOnlyPendingTimers(); });
    expect(byLabel(r, 'Delete this clip')).toBeUndefined();
    act(() => { byLabel(r, 'Share this clip')!.props['onPress'](); });
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(byLabel(r, 'Report this clip')).toBeDefined();
  });
  it('has no long-press when there is nothing to do with it', async () => {
    const r = await mount(<ClipCard clip={clip} onPlay={jest.fn()} />);
    expect(byLabel(r, 'Clip 12:02 to 12:32')!.props['onLongPress']).toBeUndefined();
  });
  it('keeps a reported or removed clip as a one-line card of the same size', async () => {
    const r = await mount(<ClipCard clip={{ ...clip, reported: true } as Clip} />);
    expect(text(r)).toContain('You reported this');
    expect(style(byId(r, 'clip-card-note'))['height']).toBe(episode.clipCard.height);
  });
});

describe('the episode page Clips section', () => {
  const playable = { id: 'e1', url: 'u', title: 'T', showTitle: 'S' };
  it('with no clips is the dashed empty deck, not a heading with a button', async () => {
    mockClips.mockReturnValue({ clips: [], pending: [], refresh: jest.fn() });
    const r = await mount(<ClipList episode={playable} />);
    expect(byId(r, 'empty-deck')).toBeDefined();
    expect(text(r)).toContain('No clips yet');
    expect(text(r)).toContain('Clip the good bit from the player.');
    expect(byLabel(r, 'Open player')).toBeUndefined();
  });
  it('with clips is a sideways deck of cards named by the edge label', async () => {
    mockClips.mockReturnValue({ clips: [clip], pending: [], refresh: jest.fn() });
    const r = await mount(<ClipList episode={playable} />);
    expect(byId(r, 'episode-section-clips')).toBeDefined();
    expect(byId(r, 'clip-card')).toBeDefined();
    expect(hosts(r, (n) => n.props['horizontal'] === true).length).toBeGreaterThan(0);
  });
});

describe('Follow and Block', () => {
  it('Follow is the hot pill, Following the quiet one; a tap flips it and a refusal springs back with a toast', async () => {
    const r = await mount(<FollowButton listenerId="u1" following={false} />);
    const press = () => byLabel(r, 'Follow') ?? byLabel(r, 'Unfollow')!;
    expect(text(r)).toContain(HOT);
    await act(async () => { await press().props['onPress'](); });
    expect(mockFollow).toHaveBeenCalled();
    expect(text(r)).toContain('Following');
    expect(text(r)).toContain(RAISE);
    expect(text(r)).not.toContain(HOT);
    mockFollow.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await press().props['onPress'](); });
    expect(text(r)).toContain(RAISE); // the unfollow was refused: still Following
    expect(mockToast).toHaveBeenCalledWith('Something went wrong.');
  });
  it('Block asks in the kit dialog (Cancel quiet, Block hot); the bar look names the person and fills the row', async () => {
    const r = await mount(<BlockButton listenerId="u1" displayName="Rui Costa" look="bar" />);
    expect(text(r)).toContain('"children":["Block Rui Costa"]');
    expect(text(r)).toContain('"flex":1');
    await act(async () => { byLabel(r, 'Block Rui Costa')!.props['onPress'](); });
    expect(text(r)).toContain('Block Rui Costa?');
    expect(text(r)).toContain('Nothing they write, clip or do will show for you.');
    expect(byLabel(r, 'Cancel')).toBeDefined();
  });
  it('the short pill says only Block', async () => {
    const r = await mount(<BlockButton listenerId="u1" displayName="Rui Costa" />);
    expect(text(r)).not.toContain('"children":["Block Rui Costa"]');
    expect(byLabel(r, 'Block Rui Costa')).toBeDefined();
  });
});

describe('the status rail', () => {
  const colours = { accent: 'a', muted: 'm', text: 't' };
  const post = { id: 's1', mine: false, author: { id: 'u2', name: 'Ana', initials: 'A' }, durationMs: 12000, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), text: null };
  it('draws 58 circles 14 apart with the hot to violet ring, and "New" in hot-text', async () => {
    const r = await mount(<VoicePosts load={() => Promise.resolve([post] as never)} remove={jest.fn()} pauseEpisode={jest.fn()} colours={colours} />);
    await act(async () => { await Promise.resolve(); });
    let ring: ReactTestInstance | null = byId(r, 'status-new-ring');
    while (ring && style(ring)['width'] === undefined) ring = ring.parent;
    expect(style(ring!)['width']).toBe(58);
    expect(style(ring!)['height']).toBe(58);
    expect(text(r)).not.toContain('Statuses · last 24 h');
    expect(text(r)).toContain('New');
  });
  it('D-A: on the Updates tab (variant updates) the circles are 56 with a 2 gap and a 2 ring (64 over all), the first is "You" with the mic', async () => {
    const r = await mount(<VoicePosts variant="updates" load={() => Promise.resolve([post] as never)} remove={jest.fn()} pauseEpisode={jest.fn()} colours={colours} />);
    await act(async () => { await Promise.resolve(); });
    let ring: ReactTestInstance | null = byId(r, 'status-new-ring');
    while (ring && style(ring)['width'] === undefined) ring = ring.parent;
    expect([style(ring!)['width'], style(ring!)['height']]).toEqual([64, 64]);
    const inner = ring!.findAll((n) => style(n)['width'] === 60);
    expect(inner.length).toBeGreaterThan(0);
    expect(text(r)).toContain('You');
    expect(text(r)).not.toContain('New');
  });
  it('the chooser is the kit sheet with both ways to post and Cancel', async () => {
    const r = await mount(<VoicePosts load={() => Promise.resolve([])} remove={jest.fn()} pauseEpisode={jest.fn()} colours={colours} />);
    await act(async () => { byLabel(r, 'Post a status: voice or text')!.props['onPress'](); });
    act(() => { jest.runOnlyPendingTimers(); });
    expect(text(r)).toContain('New status · gone after 24 h');
    expect(text(r)).toContain('Voice · up to 60 seconds');
    act(() => { byLabel(r, 'Write a text status')!.props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith('/status/text');
    expect(byLabel(r, 'Cancel')).toBeDefined();
  });
});

describe('muted threads', () => {
  it('lists each thread in one raise group with an Unmute chip that toasts', async () => {
    mockMuted.mockReturnValue(Promise.resolve([{ threadKind: 'comment', threadKey: 'k1', title: 'Bea replied to your comment' }]));
    const r = await mount(<MutedThreads />);
    await act(async () => { await Promise.resolve(); });
    // F3 (design-pulse2 `muted-threads--toast`): one raise group, radius 22, 6 / 14 of padding; the chip is 32 tall (tap area 44), no glyph before the name.
    const group = style(byId(r, 'muted-threads'));
    expect(group).toMatchObject({ borderRadius: 22, paddingVertical: 6, paddingHorizontal: 14 });
    const chip = byLabel(r, 'Unmute Bea replied to your comment')!;
    expect(style(chip)).toMatchObject({ height: 32, paddingHorizontal: 14 });
    expect(chip.props['hitSlop']).toMatchObject({ top: 6, bottom: 6 });
    expect(r.root.findAll((n) => typeof n.type === 'string' && String(n.props['testID'] ?? '').startsWith('icon-'))).toHaveLength(0);
    await act(async () => { byLabel(r, 'Unmute Bea replied to your comment')!.props['onPress'](); await Promise.resolve(); });
    expect(mockToast).toHaveBeenCalledWith('Unmuted. New notices from it will show again.');
    expect(text(r)).toContain('No muted threads.');
  });
  it('says so when it cannot load', async () => {
    mockMuted.mockReturnValue(Promise.reject(new Error('x')));
    const r = await mount(<MutedThreads />);
    await act(async () => { await Promise.resolve(); });
    expect(text(r)).toContain("Couldn't load your muted threads.");
  });
});
