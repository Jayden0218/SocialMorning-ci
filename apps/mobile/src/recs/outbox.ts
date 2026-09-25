/**
 * M8 US6 — what was shown, and what happened next (FR-028).
 *
 * A tap must never wait on a network call. That is M2's rule and it is not negotiable for
 * a recommendation row: the whole point of the list is that opening something from it
 * feels the same as opening anything else. So every event goes into `rec_outbox` on the
 * phone and is flushed in batches.
 *
 * Impressions are deduplicated per list: one row per (episode, position) per render, not
 * one per scroll. Without that, `fatigue` — which counts impressions — would climb every
 * time a finger moved and would drop items the listener never actually got a chance to
 * see.
 */
import type { ApiClient, ForYouChannel } from '../social/api';
import type { RecEventRow, RecOutboxStore } from '../storage/types';

export const FLUSH_BATCH = 200;

export type RecOutbox = {
  /** Called once per list render with everything that is on screen. */
  impressions(items: readonly { episodeId: string; channel: ForYouChannel }[], at: number): void;
  opened(e: { episodeId: string; channel: ForYouChannel; rank: number }, at: number): void;
  played(e: { episodeId: string; channel: ForYouChannel; rank: number }, at: number): void;
  /** Best effort. Never throws; the rows stay for the next attempt. */
  flush(): Promise<number>;
  /** Sign-out: these rows belong to the listener who made them. */
  clear(): void;
};

export function createRecOutbox(deps: { api: ApiClient; store: RecOutboxStore; isSignedIn: () => boolean }): RecOutbox {
  /** (episodeId, rank) already counted this session — an impression is per list, not per scroll. */
  const counted = new Set<string>();

  const add = (r: RecEventRow): void => { deps.store.add(r); };

  return {
    impressions(items, at) {
      items.forEach((i, rank) => {
        const key = `${i.episodeId}\u0001${rank}`;
        if (counted.has(key)) return;
        counted.add(key);
        add({ episodeId: i.episodeId, channel: i.channel, rank, kind: 'impression', at });
      });
    },
    opened: (e, at) => add({ ...e, kind: 'open', at }),
    played: (e, at) => add({ ...e, kind: 'play', at }),
    async flush() {
      if (!deps.isSignedIn()) return 0;
      const rows = deps.store.take(FLUSH_BATCH);
      if (rows.length === 0) return 0;
      try {
        await deps.api.postRecEvents(rows.map((r) => ({
          episodeId: r.episodeId, channel: r.channel, rank: r.rank, kind: r.kind, at: new Date(r.at).toISOString(),
        })));
        deps.store.remove(rows.map((r) => r.id!));
        return rows.length;
      } catch {
        // Offline or the server is unhappy: the rows stay exactly where they are.
        return 0;
      }
    },
    clear() {
      counted.clear();
      deps.store.clear();
    },
  };
}
