/**
 * The Discover data for a screen: last copy at once, a refresh on focus, `open(card)` through the resolver.
 * M10: `play(card)` resolves the same way and starts it — the round play button on every row.
 */
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { refreshShow } from '@/feeds/fetch';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { createDiscover, type DiscoverView } from './cache';
import { resolveCard } from './open';
import type { EpisodeCard } from '@/social/api';

/** How old the Discover copy may be before opening the tab fetches a new one. */
export const FOCUS_REFRESH_MS = 5 * 60_000;

export function dueForRefresh(fetchedAt: number | string | undefined, now: number): boolean {
  if (fetchedAt === undefined) return true;
  const at = typeof fetchedAt === 'number' ? fetchedAt : Date.parse(fetchedAt);
  return !(now - at < FOCUS_REFRESH_MS);
}

export function useDiscover() {
  const { api } = useSocial();
  const stores = useStores();
  const discover = useMemo(() => createDiscover({ api, cache: stores.feedCache, now: () => Date.now() }), [api, stores]);
  // M12 NEW-9: the saved copy is not "couldn't refresh" until a refresh has actually failed —
  // the first launch showed that banner before any request was made.
  const [view, setView] = useState<DiscoverView | undefined>(() => {
    const c = discover.cached();
    return c ? { ...c, stale: false } : undefined;
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { const v = await discover.refresh(); if (v) setView(v); } catch { /* the cached copy stands */ } finally { setRefreshing(false); }
  }, [discover]);
  // M12 NEW-9 (found on the iPhone): every focus used to refresh through the pull spinner,
  // pushing the page down ~50 pt after each back-swipe. A focus now refreshes quietly, and
  // only when the copy is older than FOCUS_REFRESH_MS; pulling still shows the spinner.
  const quiet = useCallback(async () => {
    if (!dueForRefresh(view?.fetchedAt, Date.now())) return;
    try { const v = await discover.refresh(); if (v) setView(v); } catch { /* the cached copy stands */ }
  }, [discover, view?.fetchedAt]);
  useFocusEffect(useCallback(() => { void quiet(); }, [quiet]));
  const { open, play } = useCardActions();
  return { view, refreshing, refresh, open, play };
}

/**
 * Open or play a Discover card through the resolver — shared by Discover and the pages it
 * links to (M12: the full chart, past picks), so a row behaves the same wherever it is.
 */
export function useCardActions() {
  const stores = useStores();
  const toast = useToast();
  const player = usePlayer();
  const open = useCallback(async (card: EpisodeCard) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    if (r.episodeId !== undefined) router.push({ pathname: '/episode/[id]', params: { id: r.episodeId } });
    else toast(r.reason === 'offline' ? "Couldn't fetch that show right now." : 'That episode is no longer in its feed.');
  }, [stores, toast]);
  const play = useCallback(async (card: EpisodeCard) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    const playable = r.episodeId !== undefined ? toPlayable(stores, r.episodeId) : undefined;
    if (playable) player.load(playable, 'play');
    else toast(r.episodeId === undefined && r.reason === 'offline' ? "Couldn't fetch that show right now." : "That episode can't be played right now.");
  }, [stores, toast, player]);
  return { open, play };
}
