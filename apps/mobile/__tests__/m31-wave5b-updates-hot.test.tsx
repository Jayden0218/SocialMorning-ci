// Wave 5b, Updates: each new-episode card shows the first hot moment ("14:32 · 41 already reacting"), from the Moments data.
/**
 * Planner, contact/wave-5b (design-pulse2 `index.html#updates--screen` and `discover.html` `upCard(..., hot)`: a TimestampChip with the moment's time,
 * then "41 already reacting" in hot-text, marked NEW; constitution v4.0.0 approves "first hot moment on Updates"). What this proves in Jest (how it
 * looks on a phone is NOT VERIFIED):
 *  - UpdateEpisodeRow takes `hot?: { startMs, reactions }` and draws one line (`testID="update-hot"`, spoken "14:32 · 41 already reacting") holding the
 *    chip text ("14:32", zero-padded like `chipClock`) and "41 already reacting"; with no `hot` there is no such line.
 *  - `useEpisodeHotMomentsWith(api, feedUrls)` (src/ui/episode/useEpisodeHotMoments.ts) answers a Map episodeId -> { startMs, reactions } (the
 *    episode's TOP moment), one request per DISTINCT feedUrl, at most 5 in flight, not asked again on a re-render with the same feeds, and one failed
 *    feed leaves the others.
 *  - (The page handing the entry to each card is m31-wave5b-updates-page.test.tsx.)
 * Every test here is RED before wave 5b phase 2 (the module and the prop do not exist yet).
 * The break that keeps them honest: ask once per card instead of once per feed in the hook; drop the prop in library.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import type { UpdateRow } from '@/me/updates';

// ---- the row ------------------------------------------------------------------------------------------------------------------------------
// PlayButton (discover/parts) reads the palette through providers, whose import chain loads expo-audio.
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));
const NOW = new Date(2026, 9, 1, 12).getTime();
const row = { episode: { id: 'e1', feedUrl: 'https://f', title: 'Ep', durationMs: 69 * 60_000, publishedAt: NOW - 3 * 3_600_000 }, showTitle: 'Show', summary: 'Notes' } as unknown as UpdateRow;
const noop = () => undefined;
const handlers = { onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop };
const draw = (extra: Record<string, unknown> = {}): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(UpdateEpisodeRow, { item: row, now: NOW, ...handlers, ...extra })); });
  return r;
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);

describe('the card\'s hot-moment line', () => {
  it('shows the moment\'s time in a chip and "N already reacting" beside it, under one spoken line', () => {
    const r = draw({ hot: { startMs: 14 * 60_000 + 32_000, reactions: 41 } });
    const line = r.root.findAll((n) => n.props['testID'] === 'update-hot');
    expect(line.length).toBeGreaterThan(0);
    expect(line[0]!.props['accessibilityLabel']).toBe('14:32 · 41 already reacting');
    expect(words(r)).toEqual(expect.arrayContaining(['14:32', '41 already reacting']));
  });
  it('writes the minutes with two digits, as every timestamp chip does ("06:10")', () => {
    const r = draw({ hot: { startMs: 6 * 60_000 + 10_000, reactions: 3 } });
    expect(words(r)).toEqual(expect.arrayContaining(['06:10', '3 already reacting']));
    expect(r.root.findAll((n) => n.props['testID'] === 'update-hot')[0]!.props['accessibilityLabel']).toBe('06:10 · 3 already reacting');
  });
  it('is not drawn when no moment is supplied', () => {
    const r = draw();
    expect(r.root.findAll((n) => n.props['testID'] === 'update-hot')).toHaveLength(0);
    expect(words(r).some((w) => w.includes('already reacting'))).toBe(false);
  });
});

// ---- the hook -----------------------------------------------------------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadHook = (): { useEpisodeHotMomentsWith: (api: unknown, feeds: readonly string[]) => ReadonlyMap<string, { startMs: number; reactions: number }> } => require('@/ui/episode/useEpisodeHotMoments');
const mo = (over: Record<string, unknown>) => ({ episodeId: 'a', showTitle: 'S', episodeTitle: 'T', startMs: 1000, endMs: 2000, reactions: 5, rank: 1, followed: false, comments: [], ...over });

describe('useEpisodeHotMoments', () => {
  function Probe(props: { api: unknown; feeds: readonly string[]; out: { v?: ReadonlyMap<string, { startMs: number; reactions: number }> } }): null {
    props.out.v = loadHook().useEpisodeHotMomentsWith(props.api, props.feeds);
    return null;
  }
  it('asks once per distinct feedUrl and answers each episode\'s top moment (most reactions, then the earlier one)', async () => {
    const list = jest.fn(async (o: { feedUrl: string }) => ({
      items: o.feedUrl === 'https://f/A'
        ? [mo({ episodeId: 'a', startMs: 5000, reactions: 9 }), mo({ episodeId: 'a', startMs: 3000, reactions: 9 }), mo({ episodeId: 'a', startMs: 1000, reactions: 4 }), mo({ episodeId: 'b', startMs: 7000, reactions: 12 })]
        : [mo({ episodeId: 'c', startMs: 2000, reactions: 6 })],
      computedAt: 'x',
    }));
    const out: { v?: ReadonlyMap<string, { startMs: number; reactions: number }> } = {};
    await act(async () => { create(createElement(Probe, { api: { list }, feeds: ['https://f/A', 'https://f/B', 'https://f/A'], out })); });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls.map((c) => c[0].feedUrl).sort()).toEqual(['https://f/A', 'https://f/B']);
    expect(out.v!.get('a')).toEqual({ startMs: 3000, reactions: 9 });
    expect(out.v!.get('b')).toEqual({ startMs: 7000, reactions: 12 });
    expect(out.v!.get('c')).toEqual({ startMs: 2000, reactions: 6 });
    expect(out.v!.get('zzz')).toBeUndefined();
  });
  it('does not ask again when the page re-renders with the same feeds (a new array, the same addresses)', async () => {
    const list = jest.fn(async () => ({ items: [mo({})], computedAt: 'x' }));
    const out: { v?: ReadonlyMap<string, { startMs: number; reactions: number }> } = {};
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(Probe, { api: { list }, feeds: ['https://f/A'], out })); });
    await act(async () => { r.update(createElement(Probe, { api: { list }, feeds: ['https://f/A'], out })); });
    expect(list).toHaveBeenCalledTimes(1);
  });
  it('has at most 5 requests in flight (7 shows)', async () => {
    let live = 0; let peak = 0;
    const list = jest.fn(async () => { live++; peak = Math.max(peak, live); await new Promise((res) => setTimeout(res, 5)); live--; return { items: [], computedAt: 'x' }; });
    const feeds = Array.from({ length: 7 }, (_, i) => `https://f/${i}`);
    await act(async () => { create(createElement(Probe, { api: { list }, feeds, out: {} })); });
    for (let i = 0; i < 100 && list.mock.calls.length < 7; i++) await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
    expect(list).toHaveBeenCalledTimes(7);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });
  it('a feed that fails leaves the others\' moments', async () => {
    const list = jest.fn(async (o: { feedUrl: string }) => { if (o.feedUrl === 'https://f/bad') throw new Error('offline'); return { items: [mo({ episodeId: 'ok' })], computedAt: 'x' }; });
    const out: { v?: ReadonlyMap<string, { startMs: number; reactions: number }> } = {};
    await act(async () => { create(createElement(Probe, { api: { list }, feeds: ['https://f/bad', 'https://f/good'], out })); });
    expect(out.v!.get('ok')).toEqual({ startMs: 1000, reactions: 5 });
  });
});

