// Known episodes on DynamoDB: by (feed, guid) through lane LB's uniqueness item, a feed's newest through its G2 partition, by id with BatchGet.
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';
import { hiddenEpisodeIds } from '../../studio/hidden-episodes.ts';
import type { EpisodeCardRow, PickEpisodeRow } from '../pick-episodes.ts';
import { episodeByGuid, episodesByIds, showEpisodes, type EpRow } from './common.ts';

const asRow = (e: EpRow): EpisodeCardRow => ({
  id: e.id, feed_url: e.feed_url, guid: e.guid, title: e.title, show_title: e.show_title, image_url: e.image_url, duration_ms: e.duration_ms,
  enclosure_url: e.enclosure_url, published_at: e.published_at, genre_id: e.genre_id, media_kind: e.media_kind,
});

/** One known episode: by guid (DV-55/89/90), or the feed's newest, skipping a hidden one when `visibleOnly` (DV-56). */
export async function pickEpisodeRows(store: Store, db: Db, feedUrl: string, guid: string | undefined, visibleOnly: boolean): Promise<PickEpisodeRow[]> {
  if (guid !== undefined) {
    const e = await episodeByGuid(store, feedUrl, guid);
    return e ? [asRow(e)] : [];
  }
  const skip = visibleOnly ? await hiddenEpisodeIds(db) : new Set<string>();
  return (await showEpisodes(store, feedUrl, { max: 1, skip })).map(asRow);
}

export async function episodeRowsByIds(store: Store, _db: Db, ids: readonly string[]): Promise<EpisodeCardRow[]> {
  return [...(await episodesByIds(store, ids)).values()].map(asRow);
}
