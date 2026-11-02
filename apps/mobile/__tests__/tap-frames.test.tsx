// Tests that icon controls have a frame of at least 44 x 44 pt of their own, not only a hitSlop.
/**
 * 035 T063 (device check A3; FR-015). Maestro's hierarchy reports a control's FRAME; `hitSlop` widens where a touch lands but not the frame, so
 * VoiceOver's focus ring, Switch Control and the device check all see the small box (tray icons 22, comment like 16 x 21, "More for this comment"
 * 16, Clear search 18, the 40 and 36 circles and chips). jest has no layout engine, so the frame is read from the style the layout engine
 * gets: `max(width, minWidth)` x `max(height, minHeight)`.
 * Breaks that turn it red: drop `minWidth` / `minHeight` from the kit's IconButton, Chip, the tray's glyphs, or the Updates card's circles.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { IconButton } from '@/ui/kit/PulseButton';
import { Chip } from '@/ui/kit/Chip';
import { EpisodeTray } from '@/ui/episode/EpisodeTray';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import type { UpdateRow } from '@/me/updates';

jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));
const MIN = 44;

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));
const draw = (el: React.ReactElement) => { act(() => { r = create(el); }); };
const frameOf = (n: ReactTestInstance) => {
  const s = (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return { w: Math.max(num(s['width']), num(s['minWidth'])), h: Math.max(num(s['height']), num(s['minHeight'])) };
};
/** The pressable named `label`: the host node carrying its name and a style. */
const control = (label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.type === 'string')[0];
  if (!n) throw new Error(`no control "${label}"`);
  return n;
};
const expectFrame = (label: string) => { const f = frameOf(control(label)); expect([label, f.w >= MIN, f.h >= MIN]).toEqual([label, true, true]); };

it.each([36, 40, 44, 52])('an IconButton drawn %s wide has a frame of at least 44', (d) => {
  draw(createElement(IconButton, { icon: 'close', label: 'Close', onPress: jest.fn(), diameter: d }));
  expectFrame('Close');
});

it('every kind of Chip has a frame of at least 44 tall (and 44 wide)', () => {
  draw(createElement('div' as never, null, createElement(Chip, { label: 'A', onPress: jest.fn() }), createElement(Chip, { label: 'B', compact: true, onPress: jest.fn() }), createElement(Chip, { label: '', icon: 'search-outline', accessibilityLabel: 'Search your shows', onPress: jest.fn() })));
  for (const l of ['A', 'B', 'Search your shows']) expectFrame(l);
});

it('the episode tray: queue, comments, like, share and more each have a 44 frame', () => {
  draw(createElement(EpisodeTray, { commentCount: 3, liked: false, onQueue: jest.fn(), onComments: jest.fn(), onLike: jest.fn(), onShare: jest.fn(), onMore: jest.fn() }));
  for (const l of ['Add to queue', 'Comments, 3', 'Like this episode', 'Share this episode', 'More: play next, download, save a moment']) expectFrame(l);
});

it('the Updates card: its four circles have a 44 frame', () => {
  const item = { episode: { id: 'e1', feedUrl: 'https://f', title: 'Ep', durationMs: 69 * 60_000, publishedAt: Date.now() - 3_600_000 }, showTitle: 'Show', summary: 'Notes' } as unknown as UpdateRow;
  const noop = () => undefined;
  draw(createElement(UpdateEpisodeRow, { item, plays: 57, comments: 8, now: Date.now(), iconColour: '#000', onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop }));
  for (const l of ['Add Ep to the queue', 'Comments on Ep, 8 comments', 'Download Ep', 'More for Ep']) expectFrame(l);
});

// Run 41362300402 (the frame guard on the whole check): the Play discs and "+" rings of the cards, the bare Play glyph, the Me "Stickers" chip, the
// transport's skip buttons and the player tray's comments button were still 16–40 pt frames.
import { DiscPlay, PlayGlyph, RingAdd } from '@/ui/discover/Deck';
it('the card Play disc, the "+" ring and the bare Play glyph have a 44 frame', () => {
  draw(createElement('div' as never, null, createElement(DiscPlay, { size: 38, title: 'T', onPress: jest.fn() }), createElement(RingAdd, { size: 38, title: 'T', onPress: jest.fn() }), createElement(PlayGlyph, { title: 'G', onPress: jest.fn() })));
  for (const l of ['Play T', 'Add T to the queue', 'Play G']) expectFrame(l);
});
