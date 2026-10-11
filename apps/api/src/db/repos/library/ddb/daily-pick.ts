// The day's pick on DynamoDB: the named episode by its (feed, guid) item, or the show's newest from G2.
/**
 * M26 lane LB, LB-61/62. By guid: `U#GUID#…` → the episode (two GetItems). Newest: G2 `SHEPS#<feedKey>`
 * newest first — dates sort as ISO strings and a missing date is `~`, which sorts AFTER them, so the dated
 * episodes are read first (`G2SK < "~"`, descending) and only a show with no dated episode falls back to `~`
 * (the old `ORDER BY published_at DESC NULLS LAST`). LB-63 (hidden by its show) stays with lane ST.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { queryPage, type Store } from '../../../ddb/store.ts';
import { uniqueOwner } from '../../../ddb/unique.ts';
import { getEpisode } from './episodes.ts';

export async function pickEpisodeRows(store: Store, db: Db, p: { feedUrl: string; guid?: string | undefined }): Promise<{ id: string; title: string }[]> {
  if (p.guid !== undefined) {
    const id = await uniqueOwner(store, K.U.guid(p.feedUrl, p.guid));
    const ep = id ? await getEpisode(store, db, id) : undefined;
    return ep ? [{ id: ep.id, title: ep.title }] : [];
  }
  const pk = K.G2eps(p.feedUrl, null, 'x').G2PK;
  for (const [cond, values] of [
    ['G2PK = :p AND G2SK < :last', { ':p': pk, ':last': K.NULL_LAST }],
    ['G2PK = :p AND begins_with(G2SK, :last)', { ':p': pk, ':last': K.NULL_LAST }],
  ] as const) {
    const out = await queryPage(store, 'main', { IndexName: K.INDEX.G2, KeyConditionExpression: cond, ExpressionAttributeValues: values, ScanIndexForward: false, Limit: 1 });
    const it = out.Items?.[0];
    if (it) return [{ id: String(it['PK']).slice(3), title: String(it['title']) }];
  }
  return [];
}
