// The episode social poll on DynamoDB: the change stamp from three items, the 100-bucket curve, the viewer's reaction buckets.
/**
 * M26 lane SC (SC-T04; SG-61 pairs: this lane keeps the counters, the poll route reads them). The ETag parts:
 * the SOCIAL item's `v` (every comment-side change bumps it), the episode META's version (lane LB: a length arriving,
 * a title …), the HEAT item's version (lane LB's helpers bump it whenever a bucket changes). Three strong GetItems.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { heatCurve } from '../../../../heat/ddb.ts';
import type { SocialStampRow } from '../episode-social.ts';
import { prefixItems } from './sc-common.ts';

export async function socialStampRows(store: Store, _db: Db, episodeId: string): Promise<SocialStampRow[]> {
  const [social, meta, heat] = await Promise.all([
    get(store, 'main', K.episodeSocial(episodeId)), get(store, 'main', K.episode(episodeId)), get(store, 'main', K.heat(episodeId)),
  ]);
  return [{
    comments_v: social ? String(social['v'] ?? 0) : null,
    episode_v: `${String(meta?.['v'] ?? '-')}/${String(meta?.['durationMs'] ?? '-')}`,
    heat_v: heat ? String(heat['v'] ?? 0) : null,
  }];
}

/** The stored curve as the rows the Postgres `episode_heat` held (buckets with at least one listener). */
export async function episodeHeatRows(store: Store, _db: Db, episodeId: string): Promise<{ bucket: number; distinct_listeners: number }[]> {
  const b = await heatCurve(store, episodeId);
  return b.flatMap((n, bucket) => (n > 0 ? [{ bucket, distinct_listeners: n }] : []));
}

/** `L#<viewer>/REACT#<episodeId>#<bb>` — sorted by bucket already (two-digit sort keys). */
export async function myReactionBucketRows(store: Store, _db: Db, episodeId: string, listenerId: string): Promise<{ bucket: number }[]> {
  return (await prefixItems(store, K.L(listenerId), `REACT#${episodeId}#`)).map((i) => ({ bucket: Number(i['bucket']) }));
}
