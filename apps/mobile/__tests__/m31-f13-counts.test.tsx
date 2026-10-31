// Tests F13 (phase 1, red first): a count of 12 345 678 prints as 12.3M everywhere, not as twelve digits.
/**
 * M31 F13 (contact/widths/README.md W1). Written BEFORE the fix. Three places still print the raw number at 320 / 430: the Updates card's hot line
 * ("12345678 already reacting"), the Comments top strip's listening count ("12345678") and the Show episode rows' meta line (plays and comments,
 * twice per row). The kit's `compactCount` ('@/ui/kit/format') is the one helper. Break: `String(props.plays)` back in `EpisodeMeta` - red.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import { CommentsMap } from '@/ui/comments/CommentsMap';
import { EpisodeMeta } from '@/ui/show/EpisodeMeta';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 430, height: 932, scale: 3, fontScale: 1 })) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const BIG = 12_345_678;

it('Updates card: the hot line says "12.3M already reacting", never 12345678', () => {
  const noop = (): void => undefined;
  const item = { episode: { id: 'e1', feedUrl: 'https://f', guid: 'g', title: 'Why mornings matter', enclosureUrl: 'https://a.mp3', publishedAt: Date.now(), durationMs: 600_000 }, showTitle: 'Morning Notes', imageUrl: undefined, feedUrl: 'https://f' };
  const r = render(createElement(UpdateEpisodeRow, {
    item: item as never, now: Date.now(), hot: { startMs: 872_000, reactions: BIG },
    onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop,
  }));
  const w = words(r);
  expect(w).toContain('12.3M already reacting');
  expect(w.some((t) => t.includes('12345678'))).toBe(false);
  const hot = r.root.findAll((n) => n.props['testID'] === 'update-hot' && typeof n.type === 'string')[0]!;
  expect(String(hot.props['accessibilityLabel'])).not.toContain('12345678');
});

it('Comments top strip: the listening count is "12.3M"', () => {
  const r = render(createElement(CommentsMap, { heat: undefined, played: 0.2, onJump: jest.fn(), listening: BIG }));
  const w = words(r);
  expect(w).toContain('12.3M');
  expect(w).not.toContain('12345678');
});

it('Show episode row meta: plays and comments are "12.3M", each once, never twelve digits', () => {
  const r = render(createElement(EpisodeMeta, { durationMs: 3_600_000, publishedAt: Date.now() - 7_200_000, plays: BIG, comments: BIG, progress: '', now: Date.now(), iconColour: '#fff' }));
  const w = words(r);
  expect(w.filter((t) => t === '12.3M')).toHaveLength(2);
  expect(w.some((t) => t.includes('12345678'))).toBe(false);
});
