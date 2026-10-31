// The first hot moment of each new episode on Updates, read once per show.
/**
 * Wave 5b (design-pulse2 `index.html#updates--screen`, constitution v4.0.0 "first hot moment on Updates"). The Moments read
 * (`GET /v1/discover/moments?feedUrl=`, contract `moments.md`) answers the hot moments of a show's newest episodes, so the page asks it ONCE
 * PER DISTINCT show (not per card, not per render), at most 5 at a time. The answer is a map episodeId -> that episode's top moment
 * (most reactions, then the earlier one). A show whose read fails is left out; the cards of the others still show theirs. Signed out works too.
 */
import { useEffect, useRef, useState } from 'react';
import { useMomentsApi, type MomentsApi } from '@/discover/moments-api';
import { SHOW_MOMENTS_LIMIT } from '@/ui/show/hot-moments';

export type HotMoment = { startMs: number; reactions: number };
export const HOT_CONCURRENCY = 5;
const NONE: ReadonlyMap<string, HotMoment> = new Map();

export function useEpisodeHotMomentsWith(api: Pick<MomentsApi, 'list'>, feedUrls: readonly string[]): ReadonlyMap<string, HotMoment> {
  const [map, setMap] = useState<ReadonlyMap<string, HotMoment>>(NONE);
  const asked = useRef(new Set<string>());
  const key = [...new Set(feedUrls.filter((f) => f !== ''))].sort().join('\n');
  useEffect(() => {
    const todo = key === '' ? [] : key.split('\n').filter((f) => !asked.current.has(f));
    if (todo.length === 0) return undefined;
    let live = true;
    for (const f of todo) asked.current.add(f);
    const queue = [...todo];
    const worker = async (): Promise<void> => {
      for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
        try {
          const page = await api.list({ limit: SHOW_MOMENTS_LIMIT, feedUrl: f });
          if (!live) return;
          setMap((prev) => {
            const next = new Map(prev);
            for (const m of page.items) {
              const have = next.get(m.episodeId);
              if (!have || m.reactions > have.reactions || (m.reactions === have.reactions && m.startMs < have.startMs)) next.set(m.episodeId, { startMs: m.startMs, reactions: m.reactions });
            }
            return next;
          });
        } catch { if (live) asked.current.delete(f); }
      }
    };
    void Promise.all(Array.from({ length: Math.min(HOT_CONCURRENCY, todo.length) }, worker));
    return () => { live = false; };
  }, [api, key]);
  return map;
}

export function useEpisodeHotMoments(feedUrls: readonly string[]): ReadonlyMap<string, HotMoment> {
  return useEpisodeHotMomentsWith(useMomentsApi(), feedUrls);
}
