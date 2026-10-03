// Builds the Queue and New episodes lists for Android Auto.
/**
 * M10b — Android Auto. The car browses two lists the app builds here, Queue and New episodes,
 * and a pick comes back as an episode id, which plays through the app's own player (queue,
 * positions and "finished" stay in charge). The native half is patches/expo-audio+58.0.0.patch
 * (expo-audio's service as a Media3 MediaLibraryService) + plugins/android-auto.js.
 */
import type { PlayerRuntime, PlayableEpisode } from '@/playback/store';
import type { Stores } from '@/storage/types';
import { latestUpdates } from '@/me/updates';

export const QUEUE_MAX = 50;
export const UPDATES_MAX = 30;

type Item = { id: string; title: string; subtitle: string; artworkUrl?: string };
export type CarSections = { sections: { id: 'queue' | 'updates'; title: string; items: Item[] }[] };

/** What the car shows. Hidden shows are left out; an empty queue is not shown at all. */
export function carSections(stores: Pick<Stores, 'queue' | 'feeds' | 'subscriptions' | 'settings'>, hidden: ReadonlySet<string>): CarSections {
  const item = (id: string): Item | undefined => {
    const e = stores.feeds.getEpisode(id);
    if (!e || hidden.has(e.feedUrl)) return undefined;
    const show = stores.feeds.getShow(e.feedUrl);
    const art = e.imageUrl ?? show?.imageUrl;
    return { id, title: e.title, subtitle: show?.title ?? '', ...(art ? { artworkUrl: art } : {}) };
  };
  const queue = stores.queue.list().map(item).filter((x): x is Item => x !== undefined).slice(0, QUEUE_MAX);
  const updates = latestUpdates(stores, hidden).map((r) => item(r.episode.id)).filter((x): x is Item => x !== undefined).slice(0, UPDATES_MAX);
  return {
    sections: [
      ...(queue.length > 0 ? [{ id: 'queue' as const, title: 'Queue', items: queue }] : []),
      { id: 'updates' as const, title: 'New episodes', items: updates },
    ],
  };
}

/** The native side (expo-audio, patched). Absent → no car (iPhone, tests, an unpatched build). */
export type CarNative = {
  setCarLibrary(json: string): void;
  addListener(event: 'onCarSelect', fn: (e: { episodeId: string }) => void): { remove(): void };
};

export type CarSync = { push(): void; dispose(): void };

export function createCarSync(deps: {
  native: CarNative;
  build: () => CarSections;
  runtime: Pick<PlayerRuntime, 'load' | 'subscribe' | 'getState'>;
  playable: (episodeId: string) => PlayableEpisode | undefined;
}): CarSync {
  let last = '';
  const push = (): void => {
    const json = JSON.stringify(deps.build());
    if (json === last) return;
    last = json;
    try { deps.native.setCarLibrary(json); } catch { /* the car is optional */ }
  };
  const pick = deps.native.addListener('onCarSelect', ({ episodeId }) => {
    const p = deps.playable(episodeId);
    if (p) deps.runtime.load(p, 'play');
  });
  // The queue moves on when an episode ends or another starts: re-send then (unchanged lists are not re-sent).
  let episode: string | undefined;
  const unsubscribe = deps.runtime.subscribe(() => {
    const st = deps.runtime.getState();
    const id = st.kind === 'idle' ? undefined : st.episodeId;
    if (id !== episode) { episode = id; push(); }
  });
  push();
  return { push, dispose: () => { pick.remove(); unsubscribe(); } };
}
