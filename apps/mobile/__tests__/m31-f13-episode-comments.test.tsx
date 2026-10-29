// Tests F13 (phase 1, red first): the Episode stats line is in the title's column; the Comments age keeps room for "2h".
/**
 * M31 F13 (widths W5, W6). Written BEFORE the fix.
 *  - W5: the stats ("120 listened . 4 comments . 2 clips") and "resumes at 12:10" were absolutely placed in `EpisodeStage` at a fixed top, so they sat
 *    under a 3-line title at 320 and ran together at 430. They live in the title block's normal flow: `EpisodeTitleBlock` takes `counts` and `resume`
 *    and draws them (testID "episode-counts") ABOVE the title (the block is anchored at its foot, so the title and the buttons do not move at 390 x 844),
 *    two lines at most; the stage draws no counts of its own.
 *    Break: put the `episode-counts` box back in the stage - red.
 *  - W6: the comment age ("2h") sits at the end of the name row after a long name and is cut to "2": it ellipsizes with room for 2 characters,
 *    i.e. one line, flexShrink 1, minWidth >= 24. Break: drop the minWidth - red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { EpisodeTitleBlock } from '@/ui/episode/EpisodeTitleBlock';
import { EpisodeStage } from '@/ui/episode/EpisodeStage';
import { episodeLayout } from '@/ui/episode/measures';
import { CommentRow } from '@/ui/comments/CommentRow';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useRouter: () => ({ push: jest.fn() }), Link: (p: { children?: unknown }) => p.children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined }, feedCache: {} }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => ({}) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {} }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 320, height: 568, scale: 3, fontScale: 1.3 })) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, el)); });
  mounted.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const COUNTS = '120 listened · 4 comments · 2 clips';
const RESUME = 'resumes at 12:10';

describe('F13-6 the Episode stats line is in the title column (widths W5)', () => {
  const block = (): ReactTestRenderer => render(createElement(EpisodeTitleBlock, {
    title: 'Why mornings matter more than the evenings ever will, a long one', showTitle: 'Morning Notes', playing: false, subscribed: false,
    onBack: jest.fn(), onShow: jest.fn(), onPlay: jest.fn(), onSubscribe: jest.fn(), onCopyTitle: jest.fn(),
    counts: COUNTS, resume: RESUME,
  } as never));

  it('the title block draws the stats in its own column, above the title (so the title and buttons stay put): normal flow, 8+ clear, two lines at most', () => {
    const r = block();
    const texts = r.root.findAll((x) => String(x.type) === 'Text');
    const at = (s: string): number => texts.findIndex((t) => say(t.props['children']).includes(s));
    expect(at('Why mornings')).toBeGreaterThanOrEqual(0);
    expect(at('120 listened')).toBeGreaterThanOrEqual(0);
    // above the show link and the title: a long title grows upward from the foot and can never cover the stats
    expect(at('120 listened')).toBeLessThan(at('Why mornings'));
    const stats = texts[at('120 listened')]!;
    expect(stats.props['numberOfLines']).toBe(2);
    const blockNode = r.root.findAll((n) => n.props['testID'] === 'episode-title-block' && typeof n.type === 'string')[0]!;
    let absolute = false;
    for (let n: ReactTestInstance | null = stats; n !== null && n !== blockNode; n = n.parent) if (flat(n)['position'] === 'absolute') absolute = true;
    expect(absolute).toBe(false);
    // the block's column gap (12) keeps the stats 8+ clear of what follows
    expect(Number(flat(blockNode)['gap'])).toBeGreaterThanOrEqual(8);
    expect(texts.some((t) => say(t.props['children']).includes(RESUME))).toBe(true);
  });

  it('the stage no longer draws the stats (they are not absolutely placed over the title)', () => {
    const layout = episodeLayout({ top: 50 });
    const r = render(createElement(EpisodeStage, { layout, coverUrl: undefined, name: 'Morning Notes', date: 'TUE 27 OCT · 48:10', hottest: undefined, heat: [], counts: COUNTS, resume: RESUME, onHottest: jest.fn() } as never));
    expect(r.root.findAll((n) => n.props['testID'] === 'episode-counts')).toHaveLength(0);
    const texts = r.root.findAll((x) => String(x.type) === 'Text').map((t) => say(t.props['children']));
    expect(texts.some((t) => t.includes('120 listened'))).toBe(false);
  });
});

describe('F13-7 the Comments age keeps room (widths W6)', () => {
  it('the age Type is one line, flexShrink 1 and minWidth >= 24', () => {
    const comment = { id: 'c1', episodeId: 'e1', userId: 'u1', author: '李小龍と一緒に朝を迎える長い名前の人 with a very long name', body: 'hi', offsetMs: 1000, createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), host: true, likes: 0, replyCount: 0 };
    const noop = (): void => undefined;
    const r = render(createElement(CommentRow, { c: comment, serverTime: new Date().toISOString(), likeOf: () => ({ liked: false, count: 0 }), onSeek: noop, onLike: noop, onMenu: noop } as never));
    const age = r.root.findAll((x) => String(x.type) === 'Text' && /^\d+h$/.test(say(x.props['children'])))[0];
    expect(age).toBeDefined();
    expect(age!.props['numberOfLines']).toBe(1);
    const st = flat(age!);
    expect(Number(st['minWidth'])).toBeGreaterThanOrEqual(24);
    // flexShrink 1 may come from the `flex-shrink` class (kit Type compiles it) or the style
    expect(st['flexShrink'] === 1 || String(age!.props['className'] ?? '').includes('flex-shrink')).toBe(true);
  });
});
