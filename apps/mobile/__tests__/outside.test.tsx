/**
 * M10b US9 — SocialNet outside the app. Guard G-W1 (a position TICK never redraws a widget):
 * the break that turns it red is `sameCard` in `src/outside/now-playing.ts` returning false
 * (every TICK would then wake the widget). The rest pins what the surfaces show.
 */
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { createOutsideBridge, outsideCard, outsideToggle, setOutsideToggle } from '@/outside/bridge';
import { bestComment, latestToPlay, nowPlayingOf, type NowPlaying } from '@/outside/now-playing';
import { liveActivitySink } from '@/outside/ios';
import { widgetTaskHandler } from '@/outside/android-widget';
import type { PlayerState } from '@/playback/types';
import type { Comment, Social } from '@/social/api';
import { createMemoryStores } from '@/storage/memory';
import { episodeId } from '@/storage/schema';

const META = (id: string) => (id === 'e1' ? { title: 'Ep one', show: 'Show' } : undefined);
const comment = (id: string, offsetMs: number | null, extra: Partial<Comment> = {}): Comment =>
  ({ id, authorId: 'a', displayName: `N${id}`, body: `body ${id}`, offsetMs, parentId: null, createdAt: '2026-09-27T00:00:00Z', deleted: false, ...extra });
const social = (comments: Comment[], buckets?: number[]): Social => ({
  serverTime: '', episode: { id: 'e1', durationMs: 100_000 }, comments,
  heat: buckets ? { available: true, buckets } : { available: false },
});

it('the card: nothing when idle; playing vs paused; an unknown episode draws nothing', () => {
  expect(nowPlayingOf({ kind: 'idle' }, META)).toBeUndefined();
  expect(nowPlayingOf({ kind: 'playing', episodeId: 'e1', positionMs: 1, lastSavedMs: 0 }, META)).toMatchObject({ title: 'Ep one', playing: true });
  expect(nowPlayingOf({ kind: 'paused', episodeId: 'e1', positionMs: 1, by: 'user' }, META)?.playing).toBe(false);
  expect(nowPlayingOf({ kind: 'playing', episodeId: 'zz', positionMs: 1, lastSavedMs: 0 }, META)).toBeUndefined();
});

it('the best comment is the one nearest the hottest moment; with no heat, the most replies; never a deleted one', () => {
  const buckets = new Array<number>(100).fill(0); buckets[70] = 9; buckets[10] = 3; // peak at 70.5 s
  const s = social([comment('a', 10_000), comment('b', 69_000), comment('c', 71_000, { deleted: true, body: null }), comment('d', null)], buckets);
  expect(bestComment(s)).toEqual({ author: 'Nb', body: 'body b', offsetMs: 69_000 });
  const flat = social([comment('a', 5_000), comment('b', 9_000, { replies: [comment('r', null)] })]);
  expect(bestComment(flat)?.body).toBe('body b');
  expect(bestComment(social([comment('x', 1, { removed: true })]))).toBeUndefined();
});

it('Siri\'s "play my latest": the first unfinished queue item, else the newest unfinished in Updates', () => {
  const stores = createMemoryStores(hash);
  const show = (feedUrl: string): Show => ({ feedUrl, title: feedUrl, explicit: false, categories: [], contentHash: 'h' });
  const ep = (guid: string, publishedAt: number): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
  const feed = (f: string, eps: Episode[]): ParsedFeed => ({ show: show(f), episodes: eps, warnings: [] });
  stores.feeds.put('https://a/f', feed('https://a/f', [ep('new', 20), ep('old', 10)]), {}, 1);
  stores.subscriptions.add('https://a/f', 0);
  const newId = episodeId('https://a/f', 'new', hash);
  const oldId = episodeId('https://a/f', 'old', hash);
  expect(latestToPlay(stores, new Set())).toBe(newId);
  stores.positions.save({ episodeId: newId, offsetMs: 1, finished: true }, 2);
  expect(latestToPlay(stores, new Set())).toBe(oldId);
  expect(latestToPlay(stores, new Set(['https://a/f']))).toBeUndefined();
  stores.queue.replace(['q-done', 'q-next'], 3);
  stores.positions.save({ episodeId: 'q-done', offsetMs: 1, finished: true }, 3);
  expect(latestToPlay(stores, new Set())).toBe('q-next');
});

function fakeRuntime(first: PlayerState) {
  let state = first; const subs = new Set<() => void>();
  return { getState: () => state, subscribe: (l: () => void) => { subs.add(l); return () => subs.delete(l); }, set(s: PlayerState) { state = s; subs.forEach((l) => l()); } };
}

it('G-W1: position TICKs never redraw; play/pause and the best comment do; the comment is fetched once', async () => {
  const rt = fakeRuntime({ kind: 'playing', episodeId: 'e1', positionMs: 0, lastSavedMs: 0 });
  const drawn: (NowPlaying | undefined)[] = [];
  let fetches = 0;
  const bridge = createOutsideBridge({
    runtime: rt, lookup: META,
    social: async () => { fetches += 1; return social([comment('a', 5_000)]); },
    sinks: [{ show: (c) => void drawn.push(c) }],
  });
  for (let t = 1; t <= 30; t++) rt.set({ kind: 'playing', episodeId: 'e1', positionMs: t * 1000, lastSavedMs: 0 });
  await Promise.resolve(); await Promise.resolve();
  expect(drawn).toHaveLength(2); // the first card, then the same card with its comment
  expect(drawn[1]?.comment?.body).toBe('body a');
  rt.set({ kind: 'paused', episodeId: 'e1', positionMs: 31_000, by: 'user' });
  expect(drawn).toHaveLength(3);
  expect(drawn[2]).toMatchObject({ playing: false, comment: { body: 'body a' } });
  expect(fetches).toBe(1);
  expect(outsideCard()?.playing).toBe(false);
  rt.set({ kind: 'idle' });
  expect(drawn[3]).toBeUndefined();
  bridge.dispose();
});

it('one surface failing never stops the others', () => {
  const rt = fakeRuntime({ kind: 'playing', episodeId: 'e1', positionMs: 0, lastSavedMs: 0 });
  const got: string[] = [];
  createOutsideBridge({ runtime: rt, lookup: META, sinks: [{ show: () => { throw new Error('no widget'); } }, { show: (c) => void got.push(c?.title ?? '-') }] }).dispose();
  expect(got).toEqual(['Ep one']);
});

it('the widget button toggles playback only while the app is alive; the widget draws the last card', async () => {
  expect(outsideToggle()).toBe(false);
  const toggled: string[] = [];
  setOutsideToggle(() => void toggled.push('t'));
  const rendered: unknown[] = [];
  const info = { widgetName: 'NowPlaying', widgetId: 1, height: 80, width: 250, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } };
  await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_CLICK', clickAction: 'TOGGLE', renderWidget: (w) => void rendered.push(w) });
  expect(toggled).toEqual(['t']);
  expect(rendered).toHaveLength(1);
  await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_DELETED', renderWidget: (w) => void rendered.push(w) });
  expect(rendered).toHaveLength(1);
  setOutsideToggle(undefined);
});

it('the live activity starts on play, updates on change, stops when nothing is loaded', () => {
  const calls: string[] = [];
  const sink = liveActivitySink({
    startActivity: (s) => { calls.push(`start ${s.title}`); return 'id1'; },
    updateActivity: (id, s) => void calls.push(`update ${id} ${s.subtitle}`),
    stopActivity: (id) => void calls.push(`stop ${id}`),
  });
  sink.show({ episodeId: 'e1', title: 'T', show: 'S', playing: false });
  sink.show({ episodeId: 'e1', title: 'T', show: 'S', playing: true });
  sink.show({ episodeId: 'e1', title: 'T', show: 'S', playing: true, comment: { author: 'A', body: 'wow', offsetMs: 1 } });
  sink.show(undefined);
  expect(calls).toEqual(['start T', 'update id1 “wow” — A', 'stop id1']);
});
