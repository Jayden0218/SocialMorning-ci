// Gives screens the For You list and refreshes it on focus.
/** M8 US2 — the For You section's data: the last copy at once, a refresh on focus. */
import { reportError } from '@/telemetry/reportError';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { createForYou, type ForYouView } from './cache';
import { getPref } from '@/settings/prefs';

export function useForYou(signedInArg: boolean) {
  const { api } = useSocial();
  const stores = useStores();
  // M10: Settings → More → Personalised recommendations. Off = no For You and, with no
  // items, no recommendation events either (useRecOutbox has nothing to report).
  const signedIn = signedInArg && getPref(stores.settings, 'personalRecs');
  const forYou = useMemo(() => createForYou({ api, cache: stores.feedCache, now: () => Date.now() }), [api, stores]);
  const [view, setView] = useState<ForYouView | undefined>(() => (signedIn ? forYou.cached() : undefined));
  // The first load is over: at once when signed out or with a saved copy, else after the first fetch.
  const [settled, setSettled] = useState(() => !signedIn || view !== undefined);
  const refresh = useCallback(async () => {
    if (!signedIn) { setView(undefined); setSettled(true); return; }
    try { const v = await forYou.refresh(); if (v) setView(v); } catch (e) { reportError('recs.forYou', e); /* the cached copy stands */ } finally { setSettled(true); }
  }, [forYou, signedIn]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return { view, refresh, settled };
}
