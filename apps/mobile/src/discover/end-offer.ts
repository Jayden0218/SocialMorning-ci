/**
 * The end-of-episode offer (M5 FR-010, research R6): when the runtime is `ended` and the
 * queue is empty, the first Next-up item is offered — shown, never loaded (guard G7).
 * Pure: the screen feeds it the state; it says what to show.
 */
import type { NextUpItem } from '../social/api';

export type PlayerLike = { kind: string; episodeId?: string };

export function endOffer(state: PlayerLike, queue: readonly string[], nextUp: readonly NextUpItem[] | undefined, forEpisodeId: string | undefined): NextUpItem | undefined {
  if (state.kind !== 'ended') return undefined;
  if (queue.length > 0) return undefined;             // M2: the queue advances by itself; nothing to offer
  if (!nextUp || nextUp.length === 0) return undefined;
  if (forEpisodeId !== undefined && state.episodeId !== undefined && forEpisodeId !== state.episodeId) return undefined; // a stale list for another episode
  return nextUp[0];
}
