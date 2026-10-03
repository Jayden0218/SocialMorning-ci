/** The inbox as the app reads it (US4): player-core's rule over the stores. */
import { inboxOf } from '@socialmorning/player-core';
import type { Stores } from '@/storage/types';
import { getPref } from '@/settings/prefs';

export const INBOX_PAGE = 50;

export function inboxIds(stores: Pick<Stores, 'feeds' | 'subscriptions' | 'positions' | 'downloads' | 'inboxState'> & { settings?: Stores['settings'] }): string[] {
  const subscriptions = stores.subscriptions.list();
  // M10 minor mode: explicit episodes never reach the inbox.
  const noExplicit = stores.settings !== undefined && getPref(stores.settings, 'hideExplicit');
  const episodes = subscriptions.flatMap((s) =>
    stores.feeds.listEpisodes(s.feedUrl).filter((e) => !(noExplicit && e.explicit)).map((e) => ({ id: e.id, feedUrl: e.feedUrl, ...(e.publishedAt !== undefined ? { publishedAt: e.publishedAt } : {}) })),
  );
  return inboxOf({
    episodes,
    subscriptions,
    positions: new Set(stores.positions.all().map((p) => p.episodeId)),
    completeDownloads: new Set(stores.downloads.list().filter((d) => d.state === 'complete').map((d) => d.episodeId)),
    left: stores.inboxState.all(),
  });
}

/**
 * M16a bug 4 (FR-006). Phone walk 2026-10-02: Inbox flashed "0 new … Nothing new" before its 68
 * rows. Cause: the page started from `useState<string[]>([])` and filled it in
 * `useFocusEffect`, which runs after the first frame is drawn — so frame one was an empty list
 * with an empty-state sentence. The page now starts in `loading` and shows "Nothing new" only
 * when a finished read is empty; a read that throws shows an error with Retry.
 */
export type InboxLoad = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; ids: string[] };

export function loadInbox(stores: Parameters<typeof inboxIds>[0]): InboxLoad {
  try { return { kind: 'ok', ids: inboxIds(stores) }; } catch { return { kind: 'error' }; }
}

/** What the page body shows for a load state. "empty" only after an answer that is empty. */
export function inboxBody(s: InboxLoad): 'loading' | 'error' | 'empty' | 'list' {
  if (s.kind === 'loading') return 'loading';
  if (s.kind === 'error') return 'error';
  return s.ids.length === 0 ? 'empty' : 'list';
}
