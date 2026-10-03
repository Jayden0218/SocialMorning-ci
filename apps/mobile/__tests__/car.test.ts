/**
 * M10b — Android Auto's lists and picks (src/outside/car.ts). Guard G-A1 (a hidden show never
 * reaches the car): the break that turns it red is dropping the `hidden.has(e.feedUrl)` check
 * in `carSections`. The native half (the patched expo-audio service) is proven only by the
 * CI compile job and a phone.
 */
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { carSections, createCarSync, UPDATES_MAX, type CarNative } from '@/outside/car';
import type { PlayerState } from '@/playback/types';
import { createMemoryStores } from '@/storage/memory';
import { episodeId } from '@/storage/schema';

const show = (feedUrl: string, title: string): Show => ({ feedUrl, title, explicit: false, categories: [], contentHash: 'h', imageUrl: `https://img/${title}.jpg` });
const ep = (guid: string, publishedAt: number): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
const feed = (s: Show, eps: Episode[]): ParsedFeed => ({ show: s, episodes: eps, warnings: [] });

function seeded() {
  const stores = createMemoryStores(hash);
  stores.feeds.put('https://a/f', feed(show('https://a/f', 'A'), [ep('a1', 20), ep('a2', 10)]), {}, 1);
  stores.feeds.put('https://h/f', feed(show('https://h/f', 'H'), [ep('h1', 30)]), {}, 1);
  stores.subscriptions.add('https://a/f', 0);
  stores.subscriptions.add('https://h/f', 0);
  return { stores, a1: episodeId('https://a/f', 'a1', hash), a2: episodeId('https://a/f', 'a2', hash), h1: episodeId('https://h/f', 'h1', hash) };
}

it('the car sees New episodes with the show and artwork; an empty queue is not shown', () => {
  const { stores, a1 } = seeded();
  const s = carSections(stores, new Set());
  expect(s.sections.map((x) => x.id)).toEqual(['updates']);
  expect(s.sections[0]!.items.find((i) => i.id === a1)).toEqual({ id: a1, title: 'a1', subtitle: 'A', artworkUrl: 'https://img/A.jpg' });
});

it('G-A1: a hidden show never reaches the car — not in New episodes, not in the queue', () => {
  const { stores, a1, h1 } = seeded();
  stores.queue.replace([h1, a1, 'unknown'], 2);
  const s = carSections(stores, new Set(['https://h/f']));
  const ids = s.sections.flatMap((x) => x.items.map((i) => i.id));
  expect(ids).not.toContain(h1);
  expect(s.sections.find((x) => x.id === 'queue')!.items.map((i) => i.id)).toEqual([a1]);
});

it('the lists are capped', () => {
  const stores = createMemoryStores(hash);
  for (let n = 0; n < 12; n++) {
    const f = `https://s${n}/f`;
    stores.feeds.put(f, feed(show(f, `S${n}`), [0, 1, 2, 3, 4].map((k) => ep(`e${n}-${k}`, n * 10 + k))), {}, 1);
    stores.subscriptions.add(f, 0);
  }
  expect(carSections(stores, new Set()).sections[0]!.items).toHaveLength(UPDATES_MAX);
});

function fakes() {
  let state: PlayerState = { kind: 'idle' };
  const subs = new Set<() => void>();
  const sent: string[] = [];
  let listener: ((e: { episodeId: string }) => void) | undefined;
  let removed = false;
  const native: CarNative = {
    setCarLibrary: (json) => void sent.push(json),
    addListener: (_e, fn) => { listener = fn; return { remove: () => { removed = true; } }; },
  };
  const loads: string[] = [];
  const runtime = {
    getState: () => state,
    subscribe: (l: () => void) => { subs.add(l); return () => subs.delete(l); },
    load: (p: { id: string }) => void loads.push(p.id),
  };
  return { native, runtime, sent, loads, pick: (id: string) => listener!({ episodeId: id }), setState: (s: PlayerState) => { state = s; subs.forEach((l) => l()); }, removed: () => removed };
}

it('a pick in the car plays through the app\'s player; an unknown id does nothing; unchanged lists are not re-sent', () => {
  const f = fakes();
  let build = { sections: [] as never[] };
  const sync = createCarSync({
    native: f.native, runtime: f.runtime as never, build: () => build,
    playable: (id) => (id === 'e1' ? { id: 'e1', url: 'https://cdn/e1.mp3', title: 'E1', showTitle: 'S' } : undefined),
  });
  expect(f.sent).toHaveLength(1);
  f.pick('e1'); f.pick('nope');
  expect(f.loads).toEqual(['e1']);
  f.setState({ kind: 'playing', episodeId: 'e1', positionMs: 0, lastSavedMs: 0 });
  expect(f.sent).toHaveLength(1); // same lists → not re-sent
  build = { sections: [{ id: 'updates', title: 'New episodes', items: [] }] as never[] };
  f.setState({ kind: 'playing', episodeId: 'e2', positionMs: 0, lastSavedMs: 0 });
  f.setState({ kind: 'playing', episodeId: 'e2', positionMs: 5_000, lastSavedMs: 0 }); // a TICK is not a change
  expect(f.sent).toHaveLength(2);
  sync.dispose();
  expect(f.removed()).toBe(true);
});
