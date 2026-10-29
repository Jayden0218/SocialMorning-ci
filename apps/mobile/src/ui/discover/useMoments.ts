// Loads the Moments list: the first page, more pages as you reach the end, and a refresh.
/**
 * M31 T025. One list for the Home screen, read by both views (the Moments feed and the Discover
 * "Hot now" tile). Signing in or out reads it again (a signed-in viewer's followed shows come
 * first). Coming back to Home reads it again once it is older than `REFRESH_AFTER_MS`. A failed
 * read keeps what is shown and says so (`error`); with nothing shown it is the error state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { reportError } from '@/telemetry/reportError';
import { useSocial } from '@/social/context';
import { useMomentsApi, type Moment, type MomentsApi } from '@/discover/moments-api';
import { mergeMoments, PAGE_SIZE, REFRESH_AFTER_MS } from './moments-logic';

export type MomentsState = {
  status: 'loading' | 'ready' | 'error';
  items: Moment[];
  /** More pages exist. */
  more: boolean;
  loadingMore: boolean;
  /** The last read failed (items may still show an older list). */
  failed: boolean;
};

export type MomentsList = MomentsState & {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Read again only if the list is older than `REFRESH_AFTER_MS`. */
  refreshIfOld: () => void;
};

const FIRST: MomentsState = { status: 'loading', items: [], more: false, loadingMore: false, failed: false };

/** For tests: the same list logic over any client. */
export function useMomentsWith(api: MomentsApi, viewerKey: string | undefined, now: () => number = Date.now): MomentsList {
  const [state, setState] = useState<MomentsState>(FIRST);
  const next = useRef<string | undefined>(undefined);
  const readAt = useRef<number | undefined>(undefined);
  /** A newer read supersedes an older one still in flight (a sign-in during a read). */
  const generation = useRef(0);
  const busy = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const mine = ++generation.current;
    busy.current = true;
    try {
      const page = await api.list({ limit: PAGE_SIZE });
      if (mine !== generation.current) return;
      next.current = page.next;
      readAt.current = now();
      setState({ status: 'ready', items: page.items, more: page.next !== undefined, loadingMore: false, failed: false });
    } catch (e) {
      if (mine !== generation.current) return;
      reportError('moments.refresh', e);
      setState((s) => ({ ...s, status: s.items.length > 0 ? 'ready' : 'error', loadingMore: false, failed: true }));
    } finally {
      if (mine === generation.current) busy.current = false;
    }
  }, [api, now]);

  const loadMore = useCallback(async (): Promise<void> => {
    const cursor = next.current;
    if (cursor === undefined || busy.current) return;
    const mine = generation.current;
    busy.current = true;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const page = await api.list({ limit: PAGE_SIZE, cursor });
      if (mine !== generation.current) return;
      next.current = page.next;
      setState((s) => ({ status: 'ready', items: mergeMoments(s.items, page.items), more: page.next !== undefined, loadingMore: false, failed: false }));
    } catch (e) {
      if (mine !== generation.current) return;
      reportError('moments.more', e);
      setState((s) => ({ ...s, loadingMore: false, failed: true }));
    } finally {
      if (mine === generation.current) busy.current = false;
    }
  }, [api]);

  const refreshIfOld = useCallback((): void => {
    if (busy.current) return;
    if (readAt.current === undefined || now() - readAt.current >= REFRESH_AFTER_MS) void refresh();
  }, [refresh, now]);

  // The first read, and a new one when the viewer changes.
  useEffect(() => {
    setState(FIRST);
    next.current = undefined;
    readAt.current = undefined;
    void refresh();
  }, [refresh, viewerKey]);

  return { ...state, refresh, loadMore, refreshIfOld };
}

export function useMoments(): MomentsList {
  const api = useMomentsApi();
  const { listener } = useSocial();
  return useMomentsWith(api, listener?.listenerId ?? 'anon');
}
