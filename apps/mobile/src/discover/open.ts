/**
 * Opening a catalogue card the phone may never have seen (M5 research R8, the same path
 * as M4's clip resolution): fetch the show's feed if unknown, find the episode by guid,
 * open its page. The show is never subscribed on the listener's behalf.
 */
import type { EpisodeCard } from '../social/api';
import type { Stores } from '../storage/types';

export type OpenDeps = { stores: Stores; refreshShow: (feedUrl: string) => Promise<unknown> };

export async function resolveCard(deps: OpenDeps, card: EpisodeCard): Promise<{ episodeId: string; via: 'cache' | 'feed' } | { episodeId: undefined; reason: 'not_in_feed' | 'offline' }> {
  if (deps.stores.feeds.getEpisode(card.id)) return { episodeId: card.id, via: 'cache' };
  try { await deps.refreshShow(card.feedUrl); } catch { return { episodeId: undefined, reason: 'offline' }; }
  if (deps.stores.feeds.getEpisode(card.id)) return { episodeId: card.id, via: 'feed' };
  return { episodeId: undefined, reason: 'not_in_feed' };
}
