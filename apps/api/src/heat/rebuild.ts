// Rebuilds an episode's reaction heat curve, counting each listener once per segment.
import type { Db } from '../db/db.ts';
import { clearEpisodeHeat, insertEpisodeHeat } from '../db/repos/library/heat.ts';

/**
 * Research R4 / data-model.md "Heat rebuild": one episode's 100 segments, rebuilt inside
 * the writing transaction. A listener counts ONCE per bucket across reactions and
 * timestamped comments — that is the `UNION` (not `UNION ALL`) and the `count(DISTINCT …)`
 * in `insertEpisodeHeat`. Guard G7 is the test that fails if either is "simplified".
 *
 * Skipped while the episode's duration is unknown (FR-021): there is no bucket without a
 * length. When a duration arrives, the caller runs this once and the moments already
 * stored fall into their buckets.
 */
export async function rebuildEpisodeHeat(db: Db, episodeId: string): Promise<void> {
  await clearEpisodeHeat(db, episodeId);
  await insertEpisodeHeat(db, episodeId);
}
