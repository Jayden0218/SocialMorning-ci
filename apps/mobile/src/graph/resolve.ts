/**
 * Turning a clip link into something playable (M4 FR-004, research R6):
 *   1. the episode is already in the feed cache (subscribed, or opened before) → it, with any download
 *   2. else fetch the show's feed; the guid is listed → the cached episode now is
 *   3. else the server's record of the episode → a Playable straight from it (the feed dropped it)
 * The show is never subscribed on the listener's behalf.
 */
import type { EpisodeRecord } from '../social/api';
import type { PlayableEpisode } from '../playback/store';
import type { Stores } from '../storage/types';
import { toPlayable } from '../storage/playable';

export type ResolveDeps = {
  stores: Stores;
  refreshShow: (feedUrl: string) => Promise<unknown>;
  filePresent?: (path: string) => boolean;
};

export type Resolved = { episode: PlayableEpisode; via: 'cache' | 'feed' | 'server' };

export async function resolveClipEpisode(deps: ResolveDeps, record: EpisodeRecord): Promise<Resolved> {
  const cached = toPlayable(deps.stores, record.id, deps.filePresent);
  if (cached) return { episode: cached, via: 'cache' };
  try { await deps.refreshShow(record.feedUrl); } catch { /* offline or the feed is gone: fall through */ }
  const fetched = toPlayable(deps.stores, record.id, deps.filePresent);
  if (fetched) return { episode: fetched, via: 'feed' };
  return {
    via: 'server',
    episode: {
      id: record.id,
      url: record.enclosureUrl,
      title: record.title,
      showTitle: record.showTitle ?? '',
      ...(record.imageUrl !== null ? { artworkUrl: record.imageUrl } : {}),
      ...(record.durationMs !== null ? { durationMs: record.durationMs } : {}),
      feedUrl: record.feedUrl,
    },
  };
}
