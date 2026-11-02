// Tests the 036 US2 defects found in the -xl screenshots: chart tile meta below the bars, no cut titles, one-line Play fits.
/**
 * 036 T012/T013 (gate-log.md "T012 defects"). There is no layout engine here, so each guard is style-level:
 *   D1  r04-04-chart-xl: the lead tile's reason ("31 comments · 1 clip this week") is drawn AFTER the heat curve in reading order and the
 *       curve is in normal flow (it was an absolute overlay at the foot, so the meta ran over the bars).
 *   D2  r04-04-chart-xl: the 1 x 2 tile keeps its Play disc out of the words' column (it covered the show name) and shows the title in full.
 *   D3  r07-01-episode-xl: "Play this episode" shrinks to fit one line instead of ending in "…".
 *   D4  r13-09-history-xl: a history row's title wraps (2 lines), it is no longer cut at "A minut…".
 * Break that turns D1 red: put the curve back in an absolute Box beside the text.
 */
import { createElement } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { chartTiles } from '@/ui/discover/ChartTiles';
import { EpisodeTitleBlock } from '@/ui/episode/EpisodeTitleBlock';
import type { ExploreChartItem } from '@/discover/explore-api';

jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: [1, 2, 3], durationMs: 60_000, comments: undefined, mine: undefined }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => () => undefined }));

const item = (id: string): ExploreChartItem => ({ key: id, reason: '31 comments · 1 clip this week', episode: { id, feedUrl: 'https://f', guid: id, title: 'Episode 1: A minute of tone', showTitle: 'Journey Morning', enclosureUrl: 'https://a.mp3' } } as unknown as ExploreChartItem);
const acts = { open: jest.fn(), play: jest.fn(), more: jest.fn() };
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const say = (x: unknown): string => {
  if (x === null || x === undefined || typeof x === 'boolean') return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (Array.isArray(x)) return x.map(say).join('');
  return say((x as { props?: { children?: unknown } }).props?.children);
};
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => String(n.type) === 'Text');
const absolute = (n: ReactTestInstance): boolean => flat(n)['position'] === 'absolute' || /(^|\s)absolute(\s|$)/.test(String(n.props['className'] ?? ''));
const ancestors = (n: ReactTestInstance): ReactTestInstance[] => { const out: ReactTestInstance[] = []; for (let p: ReactTestInstance | null = n; p !== null; p = p.parent) out.push(p); return out; };

describe('D1 the lead chart tile: the meta sits below the bars', () => {
  const lead = (): ReactTestRenderer => render(chartTiles([item('a')], acts)[0]!.node as React.ReactElement);
  it('the reason comes after the heat curve in reading order', () => {
    const r = lead();
    const order = r.root.findAll((n) => n.props['testID'] === 'chart-curve' || (String(n.type) === 'Text' && say(n.props['children']).includes('31 comments')));
    expect(order.map((n) => String(n.type) === 'Text' ? 'meta' : 'curve').filter((v, i, a) => a.indexOf(v) === i)).toEqual(['curve', 'meta']);
  });
  it('the curve is in normal flow: no absolute Box on the way up from it', () => {
    const curve = lead().root.findAll((n) => n.props['testID'] === 'chart-curve')[0]!;
    expect(curve).toBeDefined();
    for (const n of ancestors(curve).slice(0, 4)) expect(absolute(n)).toBe(false);
  });
  it('the meta is not absolutely positioned and the title keeps its two lines', () => {
    const r = lead();
    const meta = texts(r).find((t) => say(t.props['children']).includes('31 comments'))!;
    for (const n of ancestors(meta).slice(0, 4)) expect(absolute(n)).toBe(false);
    const title = texts(r).find((t) => say(t.props['children']) === 'Episode 1: A minute of tone')!;
    expect(title.props['numberOfLines']).toBe(2);
  });
});

describe('D2 the 1 x 2 chart tile at the largest text', () => {
  const small = (): ReactTestRenderer => render(chartTiles([item('a'), item('b')], acts)[1]!.node as React.ReactElement);
  it('the Play disc is not absolutely placed at the foot (it covered the show name)', () => {
    const r = small();
    const disc = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Play Episode 1: A minute of tone' || String(n.props['accessibilityLabel'] ?? '').startsWith('Play'))[0]!;
    expect(disc).toBeDefined();
    for (const n of ancestors(disc).slice(0, 5)) expect(flat(n)['bottom']).toBeUndefined();
  });
  it('the title may take three lines and the show name is one; the type stops growing at 1.15 so the tile holds', () => {
    const r = small();
    const title = texts(r).find((t) => say(t.props['children']) === 'Episode 1: A minute of tone')!;
    expect(title.props['numberOfLines']).toBe(3);
    expect(Number(title.props['maxFontSizeMultiplier'])).toBeLessThanOrEqual(1.15);
    const show = texts(r).find((t) => say(t.props['children']) === 'Journey Morning')!;
    expect(show.props['numberOfLines']).toBe(1);
    expect(Number(show.props['maxFontSizeMultiplier'])).toBeLessThanOrEqual(1.15);
  });
});

describe('D3 "Play this episode" at the largest text', () => {
  it('the words shrink to fit one line instead of ending in an ellipsis', () => {
    const r = render(createElement(EpisodeTitleBlock, { title: 'T', showTitle: 'S', playing: false, subscribed: true, onBack: jest.fn(), onShow: jest.fn(), onPlay: jest.fn(), onSubscribe: jest.fn(), onCopyTitle: jest.fn() }));
    const words = texts(r).find((t) => say(t.props['children']) === 'Play this episode')!;
    expect(words.props['numberOfLines']).toBe(1);
    expect(words.props['adjustsFontSizeToFit']).toBe(true);
  });
});

describe('D4 a history row title wraps', () => {
  it('app/history.tsx: the row title is two lines, not one (source text, the screen needs the whole app shell)', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'history.tsx'), 'utf8');
    expect(src).toMatch(/numberOfLines=\{2\}>\{item\.episode\.title\}/);
    expect(src).not.toMatch(/numberOfLines=\{1\}>\{item\.episode\.title\}/);
  });
});
