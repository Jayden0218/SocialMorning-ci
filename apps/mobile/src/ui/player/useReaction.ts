// Reacting at the moment you are at: shared by the tray's heart and a double tap on the cover.
/**
 * M31 T024. The player page reacts from two places — the heart in the tray and a double tap on the
 * cover (design-pulse2 `player--screen`) — and both must show the same state, so the listener's
 * own reaction buckets and the clap counter live in one small store, keyed by episode. The old
 * page held them in `useState` at the top, which re-rendered the whole page; here only the parts that draw
 * them subscribe.
 *
 * `reacted` is read through a player selector, so it re-renders only when the answer flips (the
 * position crossing into a bucket the listener has or has not marked), never on every TICK.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { playerDurationMs, playerPositionMs, usePlayer, usePlayerSelector } from '@/playback/store';
import { useSocial } from '@/social/context';

const mine = new Map<string, number[]>();
let claps = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };

/** Test hook: forget everything. */
export function resetReactionStore(): void { mine.clear(); claps = 0; emit(); }

/** The clap counter: it goes up each time a reaction is turned ON; `ClapBurst` plays on each change. */
export function useClaps(): number {
  return useSyncExternalStore(subscribe, () => claps, () => claps);
}

/** The buckets the listener has marked on this episode: the server's, or the newer optimistic ones. */
export function useMyBuckets(episodeId: string | undefined, serverBuckets: number[] | undefined): number[] {
  const local = useSyncExternalStore(subscribe, () => (episodeId === undefined ? undefined : mine.get(episodeId)), () => undefined);
  return local ?? serverBuckets ?? NONE;
}
const NONE: number[] = [];

export function useReaction(episodeId: string | undefined): { reacted: boolean; toggle: () => void } {
  const player = usePlayer();
  const { reactToggle, listener, bump, useEpisodeSocial } = useSocial();
  const { cached } = useEpisodeSocial(episodeId);
  const buckets = useMyBuckets(episodeId, cached?.social.myReactionBuckets);
  const axisOf = (durationMs: number | undefined) => cached?.social.episode.durationMs ?? durationMs;
  // The server buckets moments against the duration it was first told (the feed's), which can differ
  // from what the player measures; every bucket sum uses the server's axis (seen on the phone 2026-09-21).
  const reacted = usePlayerSelector((s) => reactToggle.isReacted(buckets, playerPositionMs(s), axisOf(playerDurationMs(s))));
  const toggle = useCallback(() => {
    if (episodeId === undefined) return;
    if (!listener) { router.push('/auth/sign-in'); return; }
    const state = player.getState();
    const positionMs = playerPositionMs(state);
    const axis = axisOf(playerDurationMs(state));
    // M21 US2: turning the reaction ON claps (a ≤ 1 s burst; none with Reduce Motion — ClapBurst).
    if (!reactToggle.isReacted(buckets, positionMs, axis)) { claps += 1; emit(); }
    const r = reactToggle.toggle(episodeId, buckets, positionMs, axis);
    mine.set(episodeId, r.optimistic); emit();
    void r.settled.then((s) => { mine.set(episodeId, s.myBuckets); emit(); bump(episodeId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- axisOf is rebuilt each render from `cached`
  }, [episodeId, listener, player, reactToggle, buckets, bump, cached]);
  return { reacted, toggle };
}
