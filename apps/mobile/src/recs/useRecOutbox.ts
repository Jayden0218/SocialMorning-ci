/**
 * M8 US6 — the outbox, wired to a screen.
 *
 * Impressions are recorded once per list, when the list arrives, not on every scroll:
 * `fatigue` counts impressions, and counting a finger movement as "you were shown this"
 * would drop items the listener never had a chance to see.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSocial } from '../social/context';
import { useStores } from '../ui/providers';
import { createRecOutbox } from './outbox';
import type { ForYouItem } from '../social/api';

export function useRecOutbox(signedIn: boolean, items: readonly ForYouItem[] | undefined) {
  const { api } = useSocial();
  const stores = useStores();
  const outbox = useMemo(
    () => createRecOutbox({ api, store: stores.recOutbox, settings: stores.settings, isSignedIn: () => signedIn }),
    [api, stores, signedIn],
  );
  const shown = useRef<readonly ForYouItem[]>([]);

  useEffect(() => {
    if (!signedIn || items === undefined || items.length === 0) return;
    shown.current = items;
    outbox.impressions(items.map((i) => ({ episodeId: i.episode.id, channel: i.channel })), Date.now());
    void outbox.flush();
  }, [signedIn, items, outbox]);

  const opened = useCallback((index: number) => {
    const item = shown.current[index];
    if (item === undefined) return;
    outbox.opened({ episodeId: item.episode.id, channel: item.channel, rank: index }, Date.now());
    void outbox.flush();
  }, [outbox]);

  return { opened, flush: () => outbox.flush() };
}
