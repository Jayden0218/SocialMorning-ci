// The reaction curve of an episode, read once for a Moments card or the pick tile, kept for the session.
/**
 * M31 T025. `GET /v1/episodes/:id/social` answers the 100 heat buckets, the episode's length and its
 * comments. A card reads it when it is near the screen (`enabled`), never for the whole list at once.
 * A copy is kept in memory (30 episodes), so scrolling back or switching views reads nothing again.
 */
import { useEffect, useState } from 'react';
import { useSocial } from '@/social/context';
import type { ApiClient } from '@/social/api';

export type EpisodeHeat = { buckets: number[] | undefined; durationMs: number | undefined; comments: number | undefined; /** The buckets this viewer reacted in (signed in). */ mine: number[] | undefined };
const NONE: EpisodeHeat = { buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined };
const KEEP = 30;
const kept = new Map<string, EpisodeHeat>();
const inflight = new Map<string, Promise<EpisodeHeat>>();

/** For tests. */
export function clearHeatCache(): void { kept.clear(); inflight.clear(); }

export function readHeat(api: Pick<ApiClient, 'social'>, episodeId: string): Promise<EpisodeHeat> {
  const have = kept.get(episodeId);
  if (have) return Promise.resolve(have);
  const running = inflight.get(episodeId);
  if (running) return running;
  const p = api.social(episodeId).then((r): EpisodeHeat => {
    if (r.status !== 200) return NONE;
    const b = r.body;
    const heat: EpisodeHeat = { buckets: b.heat.available ? b.heat.buckets : undefined, durationMs: b.episode.durationMs ?? undefined, comments: b.comments.length, mine: b.myReactionBuckets };
    kept.set(episodeId, heat);
    if (kept.size > KEEP) kept.delete(kept.keys().next().value as string);
    return heat;
  }, () => NONE).finally(() => { inflight.delete(episodeId); });
  inflight.set(episodeId, p);
  return p;
}

export function useEpisodeHeat(episodeId: string, enabled: boolean): EpisodeHeat {
  const { api } = useSocial();
  const [heat, setHeat] = useState<EpisodeHeat>(() => kept.get(episodeId) ?? NONE);
  // What is already kept for this episode is shown at once.
  const have = enabled ? kept.get(episodeId) : undefined;
  useEffect(() => {
    if (!enabled || kept.has(episodeId)) return undefined;
    let live = true;
    void readHeat(api, episodeId).then((h) => { if (live) setHeat(h); });
    return () => { live = false; };
  }, [api, episodeId, enabled]);
  return have ?? heat;
}
