/** How the phone describes an episode to the server (client-registered, research R6). */
import type { EpisodeRegistration } from './api';
import type { Stores } from '../storage/types';

export function registrationFor(stores: Pick<Stores, 'feeds'>, episodeId: string): EpisodeRegistration | undefined {
  const e = stores.feeds.getEpisode(episodeId);
  if (!e) return undefined;
  const show = stores.feeds.getShow(e.feedUrl);
  const imageUrl = e.imageUrl ?? show?.imageUrl;
  return {
    feedUrl: e.feedUrl,
    guid: e.guid,
    title: e.title,
    ...(show?.title ? { showTitle: show.title } : {}),
    enclosureUrl: e.enclosureUrl,
    ...(imageUrl ? { imageUrl } : {}),
    ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
    // M8: the publisher's date and the show's categories. Both were already cached here
    // and were never sent, so every server-side episode had a NULL `published_at` —
    // which made the freshness half of the ordering meaningless (found on the phone,
    // 2026-09-26: 356 episodes, 0 dated).
    ...(e.publishedAt !== undefined ? { publishedAt: new Date(e.publishedAt).toISOString() } : {}),
    ...(show && show.categories.length > 0 ? { categories: show.categories.slice(0, 10) } : {}),
  };
}
