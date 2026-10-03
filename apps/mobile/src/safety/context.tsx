/**
 * M6: the safety layer for the screens — report, block, the viewer's sets, and a version
 * that bumps on every local change so lists re-filter at once. Sits inside
 * <SocialProvider> (same api, same listener). Sign-in refills from the server.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSocial } from '../social/context';
import { useStores } from '../ui/providers';
import { createSafety, type Safety } from './hidden';
import { filterClips, filterComments, filterFeed, filterListeners, type Sets } from './filter';
import type { Clip, ClipAuthor, Comment, FeedItem } from '../social/api';

export type SafetyContextValue = {
  safety: Safety;
  /** Bumps on every local change; put it in a dependency list to re-filter. */
  version: number;
  sets: Sets;
  comments: (c: readonly Comment[]) => Comment[];
  clips: (c: readonly Clip[]) => Clip[];
  feed: (i: readonly FeedItem[]) => FeedItem[];
  listeners: (l: readonly ClipAuthor[]) => ClipAuthor[];
  hiddenFeeds: Set<string>;
};

const SafetyContext = createContext<SafetyContextValue | undefined>(undefined);

export function useSafety(): SafetyContextValue {
  const v = useContext(SafetyContext);
  if (v === undefined) throw new Error('useSafety must be used inside <SafetyProvider>');
  return v;
}

export function SafetyProvider(props: { children?: ReactNode }): ReactNode {
  const stores = useStores();
  const { api, listener } = useSocial();
  const [version, setVersion] = useState(0);
  const bump = useRef(() => setVersion((v) => v + 1));
  const safety = useMemo(() => createSafety({
    api, stores, now: () => Date.now(),
    viewerId: () => stores.auth.get()?.listenerId,
    onChange: () => bump.current(),
  }), [api, stores]);

  // Sign-in: refill from the server (and push anything pending). Sign-out already cleared the stores.
  const who = listener?.listenerId;
  useEffect(() => { if (who) void safety.refill().catch(() => undefined); }, [who, safety]);

  const value = useMemo<SafetyContextValue>(() => {
    const sets = safety.sets();
    return {
      safety, version, sets,
      comments: (c) => filterComments(c, sets),
      clips: (c) => filterClips(c, sets),
      feed: (i) => filterFeed(i, sets),
      listeners: (l) => filterListeners(l, sets),
      hiddenFeeds: safety.hiddenFeeds(),
    };
  }, [safety, version]);
  return <SafetyContext.Provider value={value}>{props.children}</SafetyContext.Provider>;
}

/** Screen readers hear what just happened (research R4). */
export function announce(text: string): void {
  try { AccessibilityInfo.announceForAccessibility(text); } catch { /* not on this platform */ }
}
