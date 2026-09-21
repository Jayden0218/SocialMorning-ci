/**
 * The react control's logic (US3, Q2 toggle): optimistic flip of the listener's
 * bucket set, server call, rollback on failure, then one refetch so the curve
 * moves. Pure over injected pieces so it is testable without React.
 */
import { bucketOf } from '@socialmorning/social-core';
import type { ApiClient, EpisodeRegistration } from './api';
import type { SocialCache } from './cache';

export type ReactDeps = {
  api: ApiClient;
  cache: SocialCache;
  now: () => number;
  registration: (episodeId: string) => EpisodeRegistration | undefined;
};

export function createReactToggle(deps: ReactDeps) {
  return {
    /** Whether the listener already has a reaction in the current segment. */
    isReacted(myBuckets: readonly number[] | undefined, offsetMs: number, durationMs: number | undefined): boolean {
      if (durationMs === undefined || !myBuckets) return false;
      return myBuckets.includes(bucketOf(offsetMs, durationMs));
    },

    /**
     * Flip. Returns the new local bucket list to show immediately; the promise
     * settles with the server's truth (or the rolled-back list on failure).
     */
    toggle(
      episodeId: string,
      myBuckets: readonly number[],
      offsetMs: number,
      durationMs: number | undefined,
    ): { optimistic: number[]; settled: Promise<{ myBuckets: number[]; error?: unknown }> } {
      if (durationMs === undefined) {
        return { optimistic: [...myBuckets], settled: Promise.resolve({ myBuckets: [...myBuckets], error: new Error('duration_unknown') }) };
      }
      const bucket = bucketOf(offsetMs, durationMs);
      const had = myBuckets.includes(bucket);
      const optimistic = had ? myBuckets.filter((b) => b !== bucket) : [...myBuckets, bucket].sort((a, b) => a - b);
      const settled = (async () => {
        try {
          const reg = deps.registration(episodeId);
          if (reg) await deps.api.registerEpisode(episodeId, { ...reg, durationMs });
          const r = await deps.api.react(episodeId, offsetMs, durationMs);
          const s = await deps.api.social(episodeId).catch(() => undefined);
          if (s && s.status === 200) {
            deps.cache.put(episodeId, s.body, s.etag, deps.now());
            return { myBuckets: s.body.myReactionBuckets ?? optimistic };
          }
          return { myBuckets: r.reacted ? (optimistic.includes(r.bucket) ? optimistic : [...optimistic, r.bucket]) : optimistic.filter((b) => b !== r.bucket) };
        } catch (error) {
          return { myBuckets: [...myBuckets], error };
        }
      })();
      return { optimistic, settled };
    },
  };
}
