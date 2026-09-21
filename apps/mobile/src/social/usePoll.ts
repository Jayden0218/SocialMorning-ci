/**
 * Hook: run the 10 s poll for `episodeId` while this screen is focused, the app
 * is in the foreground, and the phone is online. "Online" is inferred from the
 * last fetch: a network failure pauses the poll for OFFLINE_BACKOFF_MS, then one
 * probe runs; no connectivity library needed.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createPoller, type Poller } from './poll';
import { useSocial } from './context';

export const OFFLINE_BACKOFF_MS = 30_000;

export function usePoll(episodeId: string | undefined): void {
  const { refresh } = useSocial();
  const poller = useRef<Poller | undefined>(undefined);

  if (poller.current === undefined) {
    poller.current = createPoller({
      tick: async (id) => {
        const { stale } = await refresh(id);
        if (stale) {
          poller.current?.update({ online: false });
          setTimeout(() => poller.current?.update({ online: true }), OFFLINE_BACKOFF_MS);
        }
      },
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    });
  }

  useEffect(() => {
    poller.current?.update({ ...(episodeId !== undefined ? { episodeId } : {}) });
  }, [episodeId]);

  useFocusEffect(
    useCallback(() => {
      poller.current?.update({ focused: true });
      return () => poller.current?.update({ focused: false });
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => poller.current?.update({ foreground: s === 'active' }));
    return () => sub.remove();
  }, []);

  useEffect(() => () => poller.current?.dispose(), []);
}
