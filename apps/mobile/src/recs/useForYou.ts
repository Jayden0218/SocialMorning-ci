/** M8 US2 — the For You section's data: the last copy at once, a refresh on focus. */
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSocial } from '../social/context';
import { useStores } from '../ui/providers';
import { createForYou, type ForYouView } from './cache';

export function useForYou(signedIn: boolean) {
  const { api } = useSocial();
  const stores = useStores();
  const forYou = useMemo(() => createForYou({ api, cache: stores.feedCache, now: () => Date.now() }), [api, stores]);
  const [view, setView] = useState<ForYouView | undefined>(() => (signedIn ? forYou.cached() : undefined));
  const refresh = useCallback(async () => {
    if (!signedIn) { setView(undefined); return; }
    try { const v = await forYou.refresh(); if (v) setView(v); } catch { /* the cached copy stands */ }
  }, [forYou, signedIn]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return { view, refresh };
}
