/**
 * From the cache rows to what the player is handed. M2 (FR-003): when a complete
 * download exists and its file is still there, the player gets the `file://` URI —
 * a valid `AudioSource` string — and never opens a stream. A download completing
 * while the same episode streams changes nothing until the next load (Q4).
 */
import type { PlayableEpisode } from '../playback/store';
import type { Stores } from './types';

export function toPlayable(stores: Stores, episodeId: string, filePresent?: (path: string) => boolean): PlayableEpisode | undefined {
  const episode = stores.feeds.getEpisode(episodeId);
  if (episode === undefined) return undefined;
  const show = stores.feeds.getShow(episode.feedUrl);
  const artworkUrl = episode.imageUrl ?? show?.imageUrl;
  const download = stores.downloads.get(episodeId);
  const local = download?.state === 'complete' && (filePresent === undefined || filePresent(download.filePath)) ? download.filePath : undefined;
  return {
    id: episode.id,
    url: local ?? episode.enclosureUrl,
    title: episode.title,
    showTitle: show?.title ?? '',
    ...(artworkUrl !== undefined && { artworkUrl }),
    ...(episode.durationMs !== undefined && { durationMs: episode.durationMs }),
    feedUrl: episode.feedUrl,
  };
}
