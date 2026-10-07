// Lists episodes you listened to, most recent first.
/**
 * Listening history (收听历史, owner 2026-09-27): every episode this phone has a position
 * for, most recent first — the same rows M1 saves to resume, so nothing new is recorded.
 */
import type { CachedEpisode, PositionRow, SettingsStore, Stores } from '@/storage/types';

export type HistoryRow = { episode: CachedEpisode; offsetMs: number; finished: boolean; updatedAt: number };

/**
 * M22 US8 (research R7): rows the listener deleted from history. Keyed by episode, the time it
 * was hidden; a row played again after that (`updatedAt` later) shows again. The position
 * itself is kept on this phone (it is the resume point), only hidden here.
 */
export const HIDDEN_KEY = 'history.hidden';

export function readHidden(s: Pick<SettingsStore, 'get'>): Record<string, number> {
  try {
    const v: unknown = JSON.parse(s.get(HIDDEN_KEY) ?? '{}');
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number'));
  } catch { return {}; }
}

/** Hides these episodes' rows, each from `at` (default: now). */
export function hideFromHistory(s: SettingsStore, ids: readonly string[], now: number, at?: (id: string) => number): void {
  if (ids.length === 0) return;
  const hidden = readHidden(s);
  for (const id of ids) hidden[id] = Math.max(hidden[id] ?? 0, at ? at(id) : now);
  s.set(HIDDEN_KEY, JSON.stringify(hidden));
}

const shown = (p: PositionRow, hidden: Record<string, number>): boolean => hidden[p.episodeId] === undefined || p.updatedAt > hidden[p.episodeId]!;

/**
 * Another phone deleted these from the account's history: a row this phone has synced (the
 * server has seen all of its progress) that the account no longer has is hidden here too, from
 * its own time — so playing it again later brings it back. Returns how many were hidden.
 */
export function hideDeletedElsewhere(s: SettingsStore, positions: readonly PositionRow[], serverIds: ReadonlySet<string>, now: number): number {
  const hidden = readHidden(s);
  const gone = positions.filter((p) => p.syncedSeq >= p.progressSeq && p.syncedSeq > 0 && !serverIds.has(p.episodeId) && shown(p, hidden));
  hideFromHistory(s, gone.map((p) => p.episodeId), now, (id) => gone.find((p) => p.episodeId === id)!.updatedAt);
  return gone.length;
}

export function listeningHistory(stores: Pick<Stores, 'positions' | 'feeds'> & Partial<Pick<Stores, 'settings'>>, limit = 100): HistoryRow[] {
  const hidden = stores.settings ? readHidden(stores.settings) : {};
  return stores.positions.all()
    .filter((p) => shown(p, hidden))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((p) => {
      const episode = stores.feeds.getEpisode(p.episodeId);
      return episode ? { episode, offsetMs: p.offsetMs, finished: p.finished, updatedAt: p.updatedAt } : undefined;
    })
    .filter((r): r is HistoryRow => r !== undefined)
    .slice(0, limit);
}

/** Every word of `term` somewhere in the texts, any case. An empty term matches all. */
export function matchesAll(term: string, texts: readonly (string | undefined)[]): boolean {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * M12 FR-006 (B6): this phone's own listening, for the listener's own profile. On the iPhone
 * the profile said "Nothing listened yet" while Recently played listed three episodes, one
 * finished — the server's totals only count what reached it. The profile shows the larger.
 */
export function localTotals(stores: Pick<Stores, 'positions' | 'feeds'>): { listenedMs: number; finished: number } {
  let listenedMs = 0;
  let finished = 0;
  for (const p of stores.positions.all()) {
    const duration = stores.feeds.getEpisode(p.episodeId)?.durationMs;
    listenedMs += p.finished && duration !== undefined ? duration : p.offsetMs;
    if (p.finished) finished += 1;
  }
  return { listenedMs, finished };
}

/**
 * M22 US12: "Mark played" (a swipe right on Updates). Saves the episode as finished — at its end
 * when the length is known — so it leaves the inbox and shows as Finished; the position sync
 * uploads it like any finished save.
 */
export function markPlayed(stores: Pick<Stores, 'positions' | 'feeds' | 'inboxState'>, episodeId: string, now: number): void {
  const duration = stores.feeds.getEpisode(episodeId)?.durationMs;
  const offsetMs = duration ?? stores.positions.get(episodeId)?.offsetMs ?? 0;
  stores.positions.save({ episodeId, offsetMs, finished: true }, now);
  stores.inboxState.mark(episodeId, 'played', now);
}
