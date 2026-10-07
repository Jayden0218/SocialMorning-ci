// Gives screens the Discover data, refreshes it, and opens or plays cards.
/**
 * The Discover data for a screen: last copy at once, a refresh on focus, `open(card)` through the resolver.
 * M10: `play(card)` resolves the same way and starts it — the round play button on every row.
 */
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSocial } from '@/social/context';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { refreshShow } from '@/feeds/fetch';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { queueEpisode } from '@/settings/queue';
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
  // Owner, 2026-10-04: the page shows whole, not piece by piece — `settled` says the first load is
  // over (at once with a saved copy; else when the first fetch succeeds or fails).
  const [settled, setSettled] = useState(() => view !== undefined);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { const v = await discover.refresh(); if (v) setView(v); } catch { /* the cached copy stands */ } finally { setRefreshing(false); setSettled(true); }
  }, [discover]);
  // M12 NEW-9 (found on the iPhone): every focus used to refresh through the pull spinner,
  // pushing the page down ~50 pt after each back-swipe. A focus now refreshes quietly, and
  // only when the copy is older than FOCUS_REFRESH_MS; pulling still shows the spinner.
  const quiet = useCallback(async () => {
    if (!dueForRefresh(view?.fetchedAt, Date.now())) return;
    try { const v = await discover.refresh(); if (v) setView(v); } catch { /* the cached copy stands */ } finally { setSettled(true); }
  }, [discover, view?.fetchedAt]);
  useFocusEffect(useCallback(() => { void quiet(); }, [quiet]));
  const { open, play, queue } = useCardActions();
  return { view, refreshing, refresh, open, play, queue, settled };
}

/**
 * Open or play a Discover card through the resolver — shared by Discover and the pages it
 * links to (M12: the full chart, past picks), so a row behaves the same wherever it is.
 */
export function useCardActions() {
  const stores = useStores();
  const toast = useToast();
  const player = usePlayer();
  const downloads = useDownloads();
  // M22 US16: `inPane` (a tablet's right pane, src/ui/shell/ListDetail.tsx) takes the resolved id instead of a push.
  const open = useCallback(async (card: EpisodeCard, inPane?: (episodeId: string) => void) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    if (r.episodeId !== undefined && inPane) inPane(r.episodeId);
    else if (r.episodeId !== undefined) router.push({ pathname: '/episode/[id]', params: { id: r.episodeId } });
    else toast(r.reason === 'offline' ? "Couldn't fetch that show right now." : 'That episode is no longer in its feed.');
  }, [stores, toast]);
  const play = useCallback(async (card: EpisodeCard) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    const playable = r.episodeId !== undefined ? toPlayable(stores, r.episodeId) : undefined;
    if (playable) player.load(playable, 'play');
    else toast(r.episodeId === undefined && r.reason === 'offline' ? "Couldn't fetch that show right now." : "That episode can't be played right now.");
  }, [stores, toast, player]);
  // Owner, 2026-10-05: an editor's pick's + adds it to the end of the queue (the queue settings apply).
  const queue = useCallback(async (card: EpisodeCard) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    if (r.episodeId === undefined) { toast(r.reason === 'offline' ? "Couldn't fetch that show right now." : 'That episode is no longer in its feed.'); return; }
    const q = queueEpisode(stores, downloads, r.episodeId, Date.now(), 'end');
    if (q.kind === 'full') { toast('The queue is full (300). Remove something first.'); return; }
    toast(`Added to the queue${q.downloading ? ' · downloading' : ''}`);
  }, [stores, toast, downloads]);
  return { open, play, queue };
}
