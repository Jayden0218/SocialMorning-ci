// Tests the Moments feed's rules: the active card, when a preview runs, the sound tap, the words, finding the episode.
/**
 * M31 T025 (research T020 §4, specs/033-m31-redesign/contracts/moments.md). Pure functions only —
 * the rendered card and feed are in m31-moments-feed.test.tsx.
 *
 * Guards and the breaks that turn them red:
 *  - "more than 60 % in view": change `share > ACTIVE_SHARE` to `>=` with `ACTIVE_SHARE = 0.5` and the
 *    mid-swipe case returns a card;
 *  - "a preview stops when anything forbids it": drop `!g.reduceMotion` (or any one gate) from
 *    `previewRuns`;
 *  - "20 s at most": remove the `Math.min(PREVIEW_MAX_MS, …)` in `previewRange`;
 *  - "no audio from a scroll": `SOUND_CARRIES_OVER` true;
 *  - "only a tap fetches": `ensureLocal` returns ok for an episode the phone has without calling
 *    `card()` / `refreshShow` for it.
 */
import {
  ACTIVE_SHARE, PREVIEW_MAX_MS, PREVIEW_MIN_MS, SOUND_CARRIES_OVER, activeCard, hotBars, hottest, loopMs, loopProgress,
  mergeMoments, momentKey, momentLine, momentTag, previewRange, previewRuns, sameClip, shortCount, soundTapPlan, type PreviewGate,
} from '@/ui/discover/moments-logic';
import { cardsOf, ensureLocal, reactAt, reasonText } from '@/ui/discover/moment-actions';
import { bucketOf } from '@socialmorning/social-core';
import type { Discover, EpisodeCard } from '@/social/api';

const card = (id: string, feedUrl = 'https://f/' + id): EpisodeCard => ({ id, feedUrl, guid: id, title: 't' + id, showTitle: 's', enclosureUrl: 'https://a/' + id + '.mp3' });

describe('the active card: more than 60 % of it in view', () => {
  it('a page exactly in view is active; so is one that is 61 % in view', () => {
    expect(activeCard(0, 800, 5)).toBe(0);
    expect(activeCard(800, 800, 5)).toBe(1);
    expect(activeCard(800 * 1.39, 800, 5)).toBe(1); // 61 % of card 1 in view
  });
  it('mid-swipe, with two cards about half each, none is active', () => {
    expect(ACTIVE_SHARE).toBe(0.6);
    expect(activeCard(400, 800, 5)).toBeUndefined();
    expect(activeCard(800 * 1.55, 800, 5)).toBeUndefined();
  });
  it('past either end, or with nothing measured, none is active', () => {
    expect(activeCard(-900, 800, 5)).toBeUndefined();
    expect(activeCard(800 * 9, 800, 5)).toBeUndefined();
    expect(activeCard(0, 0, 5)).toBeUndefined();
    expect(activeCard(0, 800, 0)).toBeUndefined();
  });
});

describe('a muted preview runs only when nothing forbids it', () => {
  const OK: PreviewGate = { active: true, focused: true, appActive: true, reduceMotion: false, web: false, paused: false };
  it('runs with every gate open', () => expect(previewRuns(OK)).toBe(true));
  it.each([
    ['not the active card', { active: false }],
    ['Home not in front (a tab change, a page pushed over it, the Discover view)', { focused: false }],
    ['the app not in front (backgrounded, locked, a call)', { appActive: false }],
    ['Reduce Motion is on', { reduceMotion: true }],
    ['the web build (tap only)', { web: true }],
    ['the listener paused it', { paused: true }],
  ] as const)('stops for: %s', (_why, change) => {
    expect(previewRuns({ ...OK, ...change })).toBe(false);
  });
});

describe('the preview is 5 to 20 s and loops', () => {
  it('a long moment is cut to 20 s from its start; a short one is stretched to 5 s', () => {
    expect(PREVIEW_MAX_MS).toBe(20_000);
    expect(PREVIEW_MIN_MS).toBe(5_000);
    expect(previewRange({ startMs: 540_000, endMs: 600_000 })).toEqual({ startMs: 540_000, endMs: 560_000 });
    expect(previewRange({ startMs: 10_000, endMs: 11_000 })).toEqual({ startMs: 10_000, endMs: 15_000 });
    expect(previewRange({ startMs: 0, endMs: 12_000 })).toEqual({ startMs: 0, endMs: 12_000 });
    expect(loopMs({ startMs: 0, endMs: 60_000 })).toBe(20_000);
  });
  it('progress wraps and never reaches 1', () => {
    expect(loopProgress(0, 10_000)).toBe(0);
    expect(loopProgress(2_500, 10_000)).toBe(0.25);
    expect(loopProgress(12_500, 10_000)).toBe(0.25);
    expect(loopProgress(10_000, 10_000)).toBe(0);
    expect(loopProgress(-5, 10_000)).toBe(0);
    expect(loopProgress(5, 0)).toBe(0);
  });
});

describe('sound: always from a tap, never carried by a scroll', () => {
  it('each new card starts silent', () => expect(SOUND_CARRIES_OVER).toBe(false));
  it('on → stop; something else playing → ask first; otherwise start', () => {
    expect(soundTapPlan({ soundOn: true, otherPlaying: false })).toBe('stop');
    expect(soundTapPlan({ soundOn: true, otherPlaying: true })).toBe('stop');
    expect(soundTapPlan({ soundOn: false, otherPlaying: true })).toBe('confirm-switch');
    expect(soundTapPlan({ soundOn: false, otherPlaying: false })).toBe('start');
  });
  it('a clip is this card\'s when the episode and the start match', () => {
    expect(sameClip({ episodeId: 'a', startMs: 5 }, { episodeId: 'a', startMs: 5 })).toBe(true);
    expect(sameClip({ episodeId: 'a', startMs: 5 }, { episodeId: 'a', startMs: 6 })).toBe(false);
    expect(sameClip(undefined, { episodeId: 'a', startMs: 5 })).toBe(false);
  });
});

describe('the words on a card', () => {
  it('the hot tag, the show line and short counts', () => {
    expect(momentTag({ startMs: 872_000, endMs: 910_000 })).toBe('HOT · 14:32 – 15:10');
    expect(momentTag({ startMs: 3_700_000, endMs: 3_730_000 })).toBe('HOT · 1:01:40 – 1:02:10');
    expect(momentLine('Morning Notes', 2400)).toBe('Morning Notes · 2.4k reacted here');
    expect([0, 7, 999, 1000, 2400, 12_000, 12_400, 100_000].map(shortCount)).toEqual(['0', '7', '999', '1k', '2.4k', '12k', '12k', '100k']);
  });
  it('the bars a moment covers on a 70-bar curve', () => {
    // a 48-minute episode: the moment 14:32–15:10 is buckets 30–31 of 100 → bars 21–21 of 70
    const d = 2_890_000;
    expect(hotBars({ startMs: 872_000, endMs: 910_000 }, d, 70)).toEqual([21, 22]);
    expect(hotBars({ startMs: 0, endMs: 10 }, d, 70)).toEqual([0, 0]);
    expect(hotBars({ startMs: d - 10, endMs: d }, d, 70)).toEqual([69, 69]);
    expect(hotBars({ startMs: 0, endMs: 10 }, undefined, 70)).toBeUndefined();
    expect(hotBars({ startMs: 0, endMs: 10 }, 0, 70)).toBeUndefined();
  });
});

describe('the list', () => {
  const m = (episodeId: string, startMs: number, reactions: number) => ({ episodeId, startMs, reactions });
  it('Hot now is the moment with the most reactions; the earlier wins a tie', () => {
    expect(hottest([m('a', 0, 5), m('b', 0, 9), m('c', 0, 9)])?.episodeId).toBe('b');
    expect(hottest([])).toBeUndefined();
  });
  it('a page that repeats a moment does not list it twice', () => {
    const merged = mergeMoments([m('a', 1, 1), m('b', 2, 1)], [m('b', 2, 9), m('c', 3, 1), m('c', 3, 1)]);
    expect(merged.map(momentKey)).toEqual(['a@1', 'b@2', 'c@3']);
    expect(merged[1]!.reactions).toBe(1);
  });
});

describe('finding the episode: only a tap fetches, and only when the phone has not got it', () => {
  const feeds = (have: string[]) => ({ feeds: { getEpisode: (id: string) => (have.includes(id) ? ({ id } as never) : undefined) } }) as never;
  it('an episode already on the phone needs no lookup and no fetch', async () => {
    const card_ = jest.fn(); const refresh = jest.fn();
    expect(await ensureLocal({ stores: feeds(['e1']), refreshShow: refresh, card: card_ }, 'e1')).toEqual({ ok: true });
    expect(card_).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it('a chart episode: the card is found, its show\'s feed fetched, then it is on the phone', async () => {
    const have: string[] = [];
    const refresh = jest.fn(async () => { have.push('e2'); });
    const r = await ensureLocal({ stores: feeds(have), refreshShow: refresh, card: async (id) => card(id) }, 'e2');
    expect(r).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledWith('https://f/e2');
  });
  it('a moment that names its feed is fetched directly: the chart is not searched (L5)', async () => {
    const have: string[] = [];
    const refresh = jest.fn(async () => { have.push('e9'); });
    const card_ = jest.fn();
    expect(await ensureLocal({ stores: feeds(have), refreshShow: refresh, card: card_ }, 'e9', 'https://feeds/own.xml')).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledWith('https://feeds/own.xml');
    expect(card_).not.toHaveBeenCalled();
  });
  it('no card for it → missing; a failed fetch → offline; a feed without it → missing', async () => {
    expect(await ensureLocal({ stores: feeds([]), refreshShow: jest.fn(), card: async () => undefined }, 'x')).toEqual({ ok: false, reason: 'missing' });
    expect(await ensureLocal({ stores: feeds([]), refreshShow: async () => { throw new Error('net'); }, card: async (id) => card(id) }, 'x')).toEqual({ ok: false, reason: 'offline' });
    expect(await ensureLocal({ stores: feeds([]), refreshShow: async () => undefined, card: async (id) => card(id) }, 'x')).toEqual({ ok: false, reason: 'missing' });
    expect(await ensureLocal({ stores: feeds([]), refreshShow: jest.fn(), card: async () => { throw new Error('chart down'); } }, 'x')).toEqual({ ok: false, reason: 'missing' });
    expect(reasonText('offline')).toMatch(/fetch that show/);
    expect(reasonText('missing')).toMatch(/isn't available/);
  });
  it('every card in the Discover data is findable by id', () => {
    const body = {
      picks: [{ kind: 'pick', key: 'p', episode: card('p1') }], talkedAbout: [{ kind: 'talkedAbout', key: 't', episode: card('t1') }], trending: [],
      said: [{ commentId: 'c', authorId: 'a', body: 'b', createdAt: 'x', episode: card('s1') }],
      newShows: [{ show: {} as never, episode: card('n1') }], newArrivals: [{ show: {} as never, episode: card('n2') }],
      video: [{ kind: 'trending', key: 'v', episode: card('v1') }], collections: [{ id: 'c', title: 't', items: [{ kind: 'trending', key: 'k', episode: card('k1') }] }],
    } as unknown as Discover;
    expect([...cardsOf(body).keys()].sort()).toEqual(['k1', 'n1', 'n2', 'p1', 's1', 't1', 'v1']);
    expect(cardsOf(undefined).size).toBe(0);
  });
  it('a reaction is sent from the middle of the moment — always inside its bucket', () => {
    const d = 2_890_000; const m = { startMs: 872_000, endMs: 900_850 };
    expect(reactAt(m)).toBe(886_425);
    expect(bucketOf(reactAt(m), d)).toBe(bucketOf(m.startMs, d));
  });
});
