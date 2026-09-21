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
  };
}
