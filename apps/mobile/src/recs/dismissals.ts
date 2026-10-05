// Remembers the episodes and shows you marked "Not interested", so For You leaves them out at once.
/**
 * M19 T021 (US2, FR-010–FR-012): the listener's "Not interested" list. The server keeps it and
 * leaves those rows out of the next For You; this copy hides a row the moment it is chosen —
 * before the next refresh — and lets Discover's recommended rows filter with the same list.
 *
 * One list for the whole app (a small module store), loaded when a screen that uses it comes
 * into focus. Changes are shown at once and undone if the server refuses them.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { EpisodeCard } from '@/social/api';
import { useSocial } from '@/social/context';
import { useProfileApi, type Dismissal, type DismissalKind, type ProfileApi } from '@/social/profile-api';

let items: Dismissal[] = [];
const subs = new Set<() => void>();
const emit = (): void => { for (const s of subs) s(); };
const same = (a: Pick<Dismissal, 'kind' | 'itemKey'>, kind: DismissalKind, key: string): boolean => a.kind === kind && a.itemKey === key;

/** True when this episode, or its show, is on the list. */
export function dismissedIn(list: readonly Pick<Dismissal, 'kind' | 'itemKey'>[], card: Pick<EpisodeCard, 'id' | 'feedUrl'>): boolean {
  return list.some((d) => (d.kind === 'episode' && d.itemKey === card.id) || (d.kind === 'show' && d.itemKey === card.feedUrl));
}

/** The key the server files a choice under: the episode's id, or its show's feed URL. */
export const keyFor = (kind: DismissalKind, card: Pick<EpisodeCard, 'id' | 'feedUrl'>): string => (kind === 'episode' ? card.id : card.feedUrl);

async function load(api: ProfileApi): Promise<void> {
  try { items = await api.dismissals(); emit(); } catch { /* keep the copy we have */ }
}

export function useDismissals(): {
  items: readonly Dismissal[];
  loaded: boolean;
  isDismissed: (card: Pick<EpisodeCard, 'id' | 'feedUrl'>) => boolean;
  dismiss: (kind: DismissalKind, itemKey: string, title?: string) => Promise<void>;
  restore: (kind: DismissalKind, itemKey: string) => Promise<void>;
  reload: () => Promise<void>;
} {
  const api = useProfileApi();
  const { listener } = useSocial();
  const signedIn = listener !== undefined;
  const [list, setList] = useState<readonly Dismissal[]>(items);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const s = () => setList(items);
    subs.add(s);
    return () => { subs.delete(s); };
  }, []);
  // Signed out: nothing is hidden (the list belongs to an account).
  useEffect(() => { if (!signedIn && items.length > 0) { items = []; emit(); } }, [signedIn]);
  const reload = useCallback(async () => {
    if (!signedIn) { setLoaded(true); return; }
    await load(api);
    setLoaded(true);
  }, [api, signedIn]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const dismiss = useCallback(async (kind: DismissalKind, itemKey: string, title?: string) => {
    if (!items.some((d) => same(d, kind, itemKey))) {
      items = [{ kind, itemKey, ...(title ? { title } : {}), createdAt: new Date().toISOString() }, ...items];
      emit();
    }
    try { await api.dismiss(kind, itemKey); } catch (e) { items = items.filter((d) => !same(d, kind, itemKey)); emit(); throw e; }
  }, [api]);

  const restore = useCallback(async (kind: DismissalKind, itemKey: string) => {
    const was = items;
    items = items.filter((d) => !same(d, kind, itemKey));
    emit();
    try { await api.undismiss(kind, itemKey); } catch (e) { items = was; emit(); throw e; }
  }, [api]);

  const isDismissed = useCallback((card: Pick<EpisodeCard, 'id' | 'feedUrl'>) => dismissedIn(list, card), [list]);
  return { items: list, loaded, isDismissed, dismiss, restore, reload };
}
