/** The inbox as the app reads it (US4): player-core's rule over the stores. */
import { inboxOf } from '@socialmorning/player-core';
import type { Stores } from '../storage/types';
import { getPref } from '../settings/prefs';

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
