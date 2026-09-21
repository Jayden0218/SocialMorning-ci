/**
 * What the M4 screens need: the clips sender, a per-episode clip list cache, and the
 * feed/profile client. Sits inside <SocialProvider> (same api, same listener).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSocial } from '../social/context';
import { registrationFor } from '../social/registration';
import { useStores } from '../ui/providers';
import { createClips, type Clips } from './clips';
import type { Clip } from '../social/api';
import type { PendingClipRow } from '../storage/types';

export type GraphContextValue = {
  clips: Clips;
  /** The episode's clips as last fetched, plus its pending ones; re-renders on change. */
  useEpisodeClips: (episodeId: string | undefined) => { clips: Clip[]; pending: PendingClipRow[]; loading: boolean; refresh: () => Promise<void> };
};

const GraphContext = createContext<GraphContextValue | undefined>(undefined);

export function useGraph(): GraphContextValue {
  const v = useContext(GraphContext);
  if (v === undefined) throw new Error('useGraph must be used inside <GraphProvider>');
  return v;
}

const newClientId = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export function GraphProvider(props: { children?: ReactNode }): ReactNode {
  const stores = useStores();
  const { api } = useSocial();
  const [lists, setLists] = useState<Record<string, Clip[]>>({});
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((n) => n + 1), []);

  const clips = useMemo(() => createClips({
    api, pending: stores.pendingClips,
    isSignedIn: () => stores.auth.get() !== undefined,
    now: () => Date.now(),
    registration: (id) => registrationFor(stores, id),
    newClientId,
    onSent: (clip) => { setLists((l) => ({ ...l, [clip.episodeId]: [clip, ...(l[clip.episodeId] ?? []).filter((c) => c.id !== clip.id)] })); bump(); },
  }), [api, stores, bump]);

  // Pending clips go when they can: at start, on every foreground. (M2's network
  // listener ticks downloads the same way; a clip is small enough that these two are enough.)
  useEffect(() => {
    void clips.sendPending();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void clips.sendPending(); });
    return () => sub.remove();
  }, [clips]);

  const useEpisodeClips = (episodeId: string | undefined) => {
    const [loading, setLoading] = useState(false);
    const refresh = useCallback(async () => {
      if (episodeId === undefined) return;
      setLoading(true);
      try {
        const r = await api.episodeClips(episodeId);
        setLists((l) => ({ ...l, [episodeId]: r.clips }));
      } catch { /* offline or unregistered: keep what we have */ } finally { setLoading(false); }
    }, [episodeId]);
    useEffect(() => { void refresh(); }, [refresh]);
    void version; // re-render on bump
    return { clips: episodeId === undefined ? [] : (lists[episodeId] ?? []), pending: episodeId === undefined ? [] : clips.pendingFor(episodeId), loading, refresh };
  };

  const value = useMemo<GraphContextValue>(() => ({ clips, useEpisodeClips }), [clips, lists, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return <GraphContext.Provider value={value}>{props.children}</GraphContext.Provider>;
}
