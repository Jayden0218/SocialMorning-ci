// Remembers the playing episode and its show, so a player tick does not read the database again.
/**
 * The lag audit (2026-10-04): the mini player and the player page re-render on every player tick
 * (about twice a second) and each render read the episode (with its show notes) and the show from
 * SQLite again. While the same episode plays they cannot change, so the last answer is kept per
 * store and episode id. A different episode, or a different store, reads afresh.
 */
import type { CachedEpisode, CachedShow, FeedCache } from '@/storage/types';

type Last = { id: string; episode: CachedEpisode | undefined; show: CachedShow | undefined };
const last = new WeakMap<FeedCache, Last>();

export function episodeAndShow(feeds: FeedCache, episodeId: string): { episode: CachedEpisode | undefined; show: CachedShow | undefined } {
  const hit = last.get(feeds);
  if (hit && hit.id === episodeId) return hit;
  const episode = feeds.getEpisode(episodeId);
  const show = episode ? feeds.getShow(episode.feedUrl) : undefined;
  const next = { id: episodeId, episode, show };
  last.set(feeds, next);
  return next;
}
