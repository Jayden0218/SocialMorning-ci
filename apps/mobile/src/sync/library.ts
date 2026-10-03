// Syncs favourites, saved moments and search history with your account.
/**
 * M10b US2 — favourites, favourite comments, saved moments and search history follow the
 * account (specs/010-m10b-the-rest/research.md R2).
 *
 * The lists stay where M10 put them (settings JSON, read by their screens). Beside them sits a
 * change log, one row per (kind, key) with its stamp and, for a removal, a tombstone — the
 * only shape that can sync (a removed row that simply vanished would be revived by the other
 * phone). Every change records here, notifies the sync, and the sync uploads the log; the
 * server answers with the merged set and the lists are rebuilt from it.
 */
import type { SettingsStore } from '@/storage/types';

export const LOG_KEY = 'library.log';
export type Kind = 'fav_episode' | 'fav_comment' | 'moment' | 'search';
export type LogItem = { kind: Kind; key: string; payload?: Record<string, unknown>; updatedAt: string; deletedAt?: string };

const listeners = new Set<() => void>();
/** The sync subscribes here, so a change made on any screen is uploaded. */
export function onLibraryChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

export function readLog(s: Pick<SettingsStore, 'get'>): LogItem[] {
  try {
    const v: unknown = JSON.parse(s.get(LOG_KEY) ?? '[]');
    return Array.isArray(v) ? (v as LogItem[]).filter((x) => typeof x?.kind === 'string' && typeof x?.key === 'string' && typeof x?.updatedAt === 'string') : [];
  } catch { return []; }
}

/** One change: a live value (payload) or a removal (payload undefined). */
export function recordChange(s: SettingsStore, kind: Kind, key: string, payload: Record<string, unknown> | undefined, now: number): void {
  const at = new Date(now).toISOString();
  const rest = readLog(s).filter((i) => !(i.kind === kind && i.key === key));
  const row: LogItem = payload === undefined
    ? { kind, key, updatedAt: at, deletedAt: at }
    : { kind, key, payload, updatedAt: at };
  s.set(LOG_KEY, JSON.stringify([row, ...rest]));
  for (const fn of listeners) fn();
}

/** The server's merged answer becomes the log, and the four lists are rebuilt from its live rows. */
export function applyMerged(s: SettingsStore, items: readonly LogItem[]): void {
  s.set(LOG_KEY, JSON.stringify(items));
  const live = items.filter((i) => i.deletedAt === undefined).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const ms = (iso: string) => Date.parse(iso);
  s.set('me.favourites', JSON.stringify(live.filter((i) => i.kind === 'fav_episode').map((i) => ({ episodeId: i.key, at: ms(i.updatedAt) }))));
  s.set('me.favComments', JSON.stringify(live.filter((i) => i.kind === 'fav_comment').map((i) => ({ commentId: i.key, ...(i.payload ?? {}), at: ms(i.updatedAt) }))));
  s.set('me.moments', JSON.stringify(live.filter((i) => i.kind === 'moment').map((i) => ({ id: i.key, episodeId: String(i.payload?.['episodeId'] ?? ''), atMs: Number(i.payload?.['atMs'] ?? 0), note: String(i.payload?.['note'] ?? ''), savedAt: Number(i.payload?.['savedAt'] ?? ms(i.updatedAt)) }))));
  s.set('search.history', JSON.stringify(live.filter((i) => i.kind === 'search').map((i) => String(i.payload?.['term'] ?? i.key)).slice(0, 12)));
}

export type LibrarySync = { reconcile(): Promise<void>; push(): void };

export function createLibrarySync(deps: {
  put: (items: LogItem[]) => Promise<{ items: LogItem[] }>;
  settings: SettingsStore;
  isSignedIn: () => boolean;
}): LibrarySync {
  let running: Promise<void> | undefined;
  let again = false;
  const reconcile = async (): Promise<void> => {
    if (!deps.isSignedIn()) return;
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        do {
          again = false;
          const merged = await deps.put(readLog(deps.settings));
          applyMerged(deps.settings, merged.items);
        } while (again);
      } finally { running = undefined; }
    })();
    return running;
  };
  onLibraryChange(() => { void reconcile().catch(() => undefined); });
  return { reconcile, push: () => { void reconcile().catch(() => undefined); } };
}
