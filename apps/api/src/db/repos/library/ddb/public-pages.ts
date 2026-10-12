// The public pages' catalogue reads on DynamoDB: a show's artwork, an episode check, the show card's episodes, the cached feed.
/**
 * M26 lane LE. Lane LB's items: the show META (`newestImage`), the episode item, G2 `SHEPS#<feedKey>` (episodes
 * by publish date; a missing date sorts as `~`), the cache entry (`readEntry`); lane ST's hidden-episode set.
 */
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Store } from '../../../ddb/store.ts';
import type { Db } from '../../../db.ts';

/** Any artwork from the same show (the SQL took any one; the show META keeps the newest). */
export async function showImageRows(store: Store, _db: Db, feedUrl: string): Promise<{ image_url: string }[]> {
  const meta = await get(store, 'main', K.show(feedUrl));
  const img = meta?.['newestImage'];
  return typeof img === 'string' && img !== '' ? [{ image_url: img }] : [];
}

export async function episodeIdRows(store: Store, _db: Db, id: string): Promise<{ id: string }[]> {
  return (await get(store, 'main', K.episode(id))) ? [{ id }] : [];
}

/** The latest 5 published (date unknown or not in the future), not hidden episodes — newest first, unknown dates last. */
export async function showCardEpisodeRows(store: Store, db: Db, feedUrl: string): Promise<{ title: string; published_at: Date | string | null }[]> {
  const { hiddenEpisodeIds } = await import('../../studio/ddb/page.ts');
  const now = new Date(store.clock.now()).toISOString();
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHEPS#${K.feedKey(feedUrl)}` }, ScanIndexForward: false,
  });
  const keyed = items.map((i) => { const sk = String(i['G2SK']); const cut = sk.lastIndexOf('#'); return { at: sk.slice(0, cut), id: sk.slice(cut + 1) }; });
  const dated = keyed.filter((e) => e.at !== K.NULL_LAST && e.at <= now);
  const undated = keyed.filter((e) => e.at === K.NULL_LAST);
  const hidden = await hiddenEpisodeIds(store, db);
  const pick = [...dated, ...undated].filter((e) => !hidden.has(e.id)).slice(0, 5);
  const eps = new Map((await batchGetAll(store, 'main', pick.map((e) => K.episode(e.id)))).map((e) => [String(e['id']), e]));
  return pick.flatMap((e) => { const it = eps.get(e.id); return it ? [{ title: String(it['title']), published_at: (it['publishedAt'] as string | undefined) ?? null }] : []; });
}

export async function cachedFeedRows(store: Store, _db: Db, feedUrl: string): Promise<{ body: unknown }[]> {
  const { readEntry } = await import('./cache.ts');
  const e = await readEntry(store, `feed:${feedUrl}`);
  return e ? [{ body: e.body }] : [];
}
