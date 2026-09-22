/** The Discover data for a screen: last copy at once, a refresh on focus, `open(card)` through the resolver. */
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSocial } from '../social/context';
import { useStores, useToast } from '../ui/providers';
import { refreshShow } from '../feeds/fetch';
import { createDiscover, type DiscoverView } from './cache';
import { resolveCard } from './open';
import type { EpisodeCard } from '../social/api';

export function useDiscover() {
  const { api } = useSocial();
  const stores = useStores();
  const toast = useToast();
  const discover = useMemo(() => createDiscover({ api, cache: stores.feedCache, now: () => Date.now() }), [api, stores]);
  const [view, setView] = useState<DiscoverView | undefined>(() => discover.cached());
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { const v = await discover.refresh(); if (v) setView(v); } catch { /* the cached copy stands */ } finally { setRefreshing(false); }
  }, [discover]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const open = useCallback(async (card: EpisodeCard) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    if (r.episodeId !== undefined) router.push({ pathname: '/episode/[id]', params: { id: r.episodeId } });
    else toast(r.reason === 'offline' ? "Couldn't fetch that show right now." : 'That episode is no longer in its feed.');
  }, [stores, toast]);
  return { view, refreshing, refresh, open };
}
