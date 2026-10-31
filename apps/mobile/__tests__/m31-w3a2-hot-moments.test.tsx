// Tests the Show screen's Hot moments tab: the per-show read, the one-card-per-episode rule, and the deck's measures and Play.
/**
 * M31 W3-A2 (T040; design-pulse2 `show--screen`, right phone; contract `moments.md` per-show filter). What it proves in Jest (how it
 * looks on a phone is NOT VERIFIED): the phone asks for `?feedUrl=`; each episode keeps its hottest moment, the most reacted first;
 * the peaks curve places each bucket; the deck is 290 x 340 cards with a 150 cover; Play hands the moment over; the three states.
 *
 * The breaks that turn it red (each tried once): drop `feedUrl` from the query in moments-api.ts; in `hottestPerEpisode` keep the first
 * moment instead of the hottest; in HotMoments make the card `height: 360`; unwire `onPlay` from the disc.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { createMomentsApi, type Moment } from '../src/discover/moments-api';
import { cardLabel, hotChip, hottestOf, hottestPerEpisode, peakCurve, reactedLine } from '../src/ui/show/hot-moments';
import { useShowMomentsWith } from '../src/ui/show/useShowMoments';
import { HotMoments } from '../src/ui/show/HotMoments';
import { SHOW } from '../src/ui/show/measures';

const m = (over: Partial<Moment>): Moment => ({
  episodeId: 'e1', showTitle: 'Morning Notes', episodeTitle: 'Why mornings matter', feedUrl: 'https://f/x', guid: 'g1', startMs: 872_000, endMs: 890_000,
  reactions: 14, rank: 1, followed: false, comments: [{ id: 'c1', author: 'Mia', text: 'the part I replay', likes: 3 }], ...over,
});

describe('the client asks the server for one show', () => {
  it('adds feedUrl to the query, encoded, and leaves it off when not asked', async () => {
    const urls: string[] = [];
    const api = createMomentsApi({ baseUrl: 'https://api.test', getToken: async () => undefined, fetch: (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ items: [], computedAt: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch });
    await api.list({ limit: 50, feedUrl: 'https://f/a.xml?x=1&y=2' });
    await api.list({ limit: 20 });
    expect(urls[0]).toBe(`https://api.test/v1/discover/moments?limit=50&feedUrl=${encodeURIComponent('https://f/a.xml?x=1&y=2')}`);
    expect(urls[1]).toBe('https://api.test/v1/discover/moments?limit=20');
  });
});

describe('one card per episode', () => {
  it('keeps each episode\'s hottest moment (the earlier on a tie), the most reacted episode first', () => {
    const cards = hottestPerEpisode([
      m({ episodeId: 'a', startMs: 1000, reactions: 5 }), m({ episodeId: 'a', startMs: 2000, reactions: 9 }),
      m({ episodeId: 'b', startMs: 5000, reactions: 20 }), m({ episodeId: 'b', startMs: 3000, reactions: 20 }),
      m({ episodeId: 'c', startMs: 100, reactions: 7 }),
    ]);
    expect(cards.map((c) => [c.episodeId, c.startMs, c.reactions])).toEqual([['b', 3000, 20], ['a', 2000, 9], ['c', 100, 7]]);
    expect(hottestOf(cards, 'a')?.startMs).toBe(2000);
    expect(hottestOf(cards, 'zzz')).toBeUndefined();
  });
  it('writes the chip, the reacted line and the spoken name as drawn', () => {
    expect(hotChip(m({}))).toBe('HOT · 14:32');
    expect(reactedLine(m({ reactions: 2400 }))).toBe('2.4k reacted here');
    expect(cardLabel(m({}))).toBe('Why mornings matter. Hot at 14:32. 14 reacted here. Mia: the part I replay');
    expect(cardLabel(m({ comments: [] }))).toBe('Why mornings matter. Hot at 14:32. 14 reacted here.');
  });
  it('places each peak at its bucket, against the hottest, and is flat without a length', () => {
    const curve = peakCurve([{ startMs: 540_000, endMs: 558_000, reactions: 12 }, { startMs: 100_000, endMs: 118_000, reactions: 6 }], 1_000_000);
    expect(curve).toHaveLength(100);
    expect(curve[54]).toBe(1);
    expect(curve[10]).toBe(0.5);
    expect(curve.filter((v) => v > 0)).toHaveLength(2);
    expect(peakCurve([{ startMs: 1, endMs: 2, reactions: 3 }], undefined).every((v) => v === 0)).toBe(true);
  });
});

describe('the hook', () => {
  const setOut = (out: { v?: ReturnType<typeof useShowMomentsWith> }, v: ReturnType<typeof useShowMomentsWith>): void => { out.v = v; };
  function Probe(props: { api: { list: jest.Mock }; feedUrl: string; out: { v?: ReturnType<typeof useShowMomentsWith> } }): null {
    setOut(props.out, useShowMomentsWith(props.api as never, props.feedUrl));
    return null;
  }
  it('reads the show once, keeps each episode\'s hottest and every moment; a failure with nothing to show is the error state', async () => {
    const list = jest.fn().mockResolvedValue({ items: [m({ startMs: 1 }), m({ startMs: 2, reactions: 30 })], computedAt: 'x' });
    const out: { v?: ReturnType<typeof useShowMomentsWith> } = {};
    await act(async () => { create(createElement(Probe, { api: { list }, feedUrl: 'https://f/x', out })); });
    expect(list).toHaveBeenCalledWith({ limit: 50, feedUrl: 'https://f/x' });
    expect(out.v!.status).toBe('ready');
    expect(out.v!.cards.map((c) => c.startMs)).toEqual([2]);
    expect(out.v!.all).toHaveLength(2);

    const bad = jest.fn().mockRejectedValue(new Error('offline'));
    const out2: { v?: ReturnType<typeof useShowMomentsWith> } = {};
    await act(async () => { create(createElement(Probe, { api: { list: bad }, feedUrl: 'https://f/x', out: out2 })); });
    expect(out2.v!.status).toBe('error');
    const none = jest.fn();
    await act(async () => { create(createElement(Probe, { api: { list: none }, feedUrl: '', out: {} })); });
    expect(none).not.toHaveBeenCalled();
  });
});

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const host = (n: ReactTestInstance): boolean => typeof n.type === 'string';
const texts = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);

describe('the deck', () => {
  const durationOf = () => 1_000_000;
  const cards = [m({}), m({ episodeId: 'e2', episodeTitle: 'Second', startMs: 311_000, endMs: 329_000, reactions: 8, comments: [] })];
  it('is 290 x 340 cards, the cover 150, the chip solid; Play hands the moment over', async () => {
    const onPlay = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(HotMoments, { status: 'ready', cards, all: cards, durationOf, onPlay, onRetry: jest.fn() })); });
    const cardBoxes = r.root.findAll((n) => host(n) && n.props['testID'] === 'hot-moment-card');
    expect(cardBoxes).toHaveLength(2);
    const wrap = r.root.findAll((n) => n.props['testID'] === 'deck-card')[0]!;
    // The deck gives each card its box (290 x 340): the box is the card's parent.
    const sized = r.root.findAll((n) => { const s = flat(n); return s['width'] === 290 && s['height'] === 340; });
    expect(sized.length).toBeGreaterThan(0);
    expect(wrap).toBeDefined();
    expect(texts(r)).toEqual(expect.arrayContaining(['HOT · 14:32', 'Why mornings matter', '“the part I replay”', '14 reacted here', 'HOT · 5:11']));
    const cover = r.root.findAll((n) => flat(n)['height'] === SHOW.deckCard.cover)[0];
    expect(cover).toBeDefined();
    const play = r.root.find((n) => n.props['accessibilityLabel'] === 'Play Why mornings matter from 14:32' && typeof n.props['onPress'] === 'function');
    act(() => { (play.props['onPress'] as () => void)(); });
    expect(onPlay).toHaveBeenCalledWith(cards[0]);
    // A card without a comment draws no quote.
    expect(new Set(texts(r).filter((t) => t.startsWith('“'))).size).toBe(1);
    expect(new Set(texts(r)).has('8 reacted here')).toBe(true);
  });
  it('shows ghosts while loading, the dashed card when empty and Retry when it failed', async () => {
    const base = { cards: [], all: [], durationOf, onPlay: jest.fn() };
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(HotMoments, { ...base, status: 'loading', onRetry: jest.fn() })); });
    expect(r.root.findAll((n) => host(n) && n.props['testID'] === 'hot-moment-ghost')).toHaveLength(1);
    await act(async () => { r = create(createElement(HotMoments, { ...base, status: 'ready', onRetry: jest.fn() })); });
    expect(texts(r)).toContain('No hot moments yet');
    const retry = jest.fn();
    await act(async () => { r = create(createElement(HotMoments, { ...base, status: 'error', onRetry: retry })); });
    expect(texts(r)).toContain("Couldn't load this show's hot moments.");
    act(() => { (r.root.find((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function').props['onPress'] as () => void)(); });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
