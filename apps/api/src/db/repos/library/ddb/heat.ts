// The heat rebuild on DynamoDB while reactions and comments still live on Postgres (the bridge until lane SC lands).
/**
 * M26 lane LB, LB-39/40. On DynamoDB the curve is kept incrementally in the writing transaction
 * (src/heat/ddb.ts: `addHeatMark` / `removeHeatMark`, called by lane SC). Until lane SC moves reactions and
 * comments, they are Postgres rows, so a rebuild reads the marks from there (a read of another lane's
 * tables through `pgOf` — data-model.md "Lane LB changes") and writes the DynamoDB marks and curve with the
 * episode's DynamoDB duration. The Postgres `episode_heat` rows are rebuilt too (the bridge), because the
 * social summary (lane SC) still reads them.
 */
import type { Db } from '../../../db.ts';
import { bridgeOf, pgOf } from '../../../backend-ddb.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { bucketOf, replaceHeat } from '../../../../heat/ddb.ts';
import * as pg from '../heat.ts';

export async function clearEpisodeHeat(_store: Store, db: Db, episodeId: string): Promise<void> {
  const raw = bridgeOf(db);
  if (raw) await pg.clearEpisodeHeat(raw, episodeId);
}

export async function insertEpisodeHeat(store: Store, db: Db, episodeId: string): Promise<void> {
  const raw = bridgeOf(db);
  if (raw) await pg.insertEpisodeHeat(raw, episodeId);
  await rebuildFromBridge(store, db, episodeId);
}

/** Recomputes the DynamoDB marks and curve from the Postgres reactions and timestamped comments. */
export async function rebuildFromBridge(store: Store, db: Db, episodeId: string): Promise<void> {
  const ep = await get(store, 'main', K.episode(episodeId));
  const duration = Number(ep?.['durationMs'] ?? 0);
  if (!(duration > 0)) return;
  const rows = await pgOf(db).query<{ listener_id: string; bucket: number | null; offset_ms: number | null }>(
    `SELECT listener_id, bucket::int AS bucket, NULL::int AS offset_ms FROM reactions WHERE episode_id = $1
     UNION ALL
     SELECT author_id AS listener_id, NULL::int AS bucket, offset_ms FROM comments
      WHERE episode_id = $1 AND offset_ms IS NOT NULL AND deleted_at IS NULL AND host_hidden_at IS NULL AND author_id IS NOT NULL`,
    [episodeId],
  );
  const refs = new Map<string, { listenerId: string; bucket: number; refs: number }>();
  for (const r of rows) {
    const bucket = r.bucket !== null ? Number(r.bucket) : bucketOf(Number(r.offset_ms), duration);
    const k = `${bucket}#${r.listener_id}`;
    const cur = refs.get(k) ?? { listenerId: String(r.listener_id), bucket, refs: 0 };
    cur.refs++;
    refs.set(k, cur);
  }
  await replaceHeat(store, episodeId, [...refs.values()]);
  // Lane SC: comments now live in DynamoDB too; the parked ones were just counted from Postgres — give them their
  // bucket so the `heat.place` job does not count them again (data-model.md "Lane SC changes").
  const { settleParked } = await import('../../social/ddb/comments.ts');
  await settleParked(store, episodeId, duration);
}
