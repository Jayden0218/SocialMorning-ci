// Reads a show's hot moments once, when the Show screen opens.
/**
 * M31 W3-A2. One call (`GET /v1/discover/moments?feedUrl=`); the server caches each episode 5 minutes. The result feeds the Hot moments
 * tab and the hot chip on the newest episode's tile. A failed read says so (`error`) and leaves the rest of the page as it was
 * (Principle IV); leaving and returning reads again. Reads nothing for a page with no feed address.
 */
import { useCallback, useEffect, useState } from 'react';
import { reportError } from '@/telemetry/reportError';
import { useMomentsApi, type Moment, type MomentsApi } from '@/discover/moments-api';
import { hottestPerEpisode, SHOW_MOMENTS_LIMIT } from './hot-moments';

/** `cards`: each episode's hottest moment, most reacted first; `all`: every moment the server sent (a card's curve is its episode's peaks). */
export type ShowMoments = { status: 'loading' | 'ready' | 'error'; cards: Moment[]; all: Moment[]; reload: () => void };

/** The same hook over any client (tests). */
export function useShowMomentsWith(api: MomentsApi, feedUrl: string): ShowMoments {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; cards: Moment[]; all: Moment[] }>({ status: 'loading', cards: [], all: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (feedUrl === '') return undefined;
    let live = true;
    setState((s) => (s.status === 'error' ? { status: 'loading', cards: [], all: [] } : s));
    api.list({ limit: SHOW_MOMENTS_LIMIT, feedUrl }).then(
      (page) => { if (live) setState({ status: 'ready', cards: hottestPerEpisode(page.items), all: page.items }); },
      (e: unknown) => { if (live) { reportError('show.moments', e); setState((s) => ({ status: s.cards.length > 0 ? 'ready' : 'error', cards: s.cards, all: s.all })); } },
    );
    return () => { live = false; };
  }, [api, feedUrl, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export function useShowMoments(feedUrl: string): ShowMoments {
  return useShowMomentsWith(useMomentsApi(), feedUrl);
}
