// An episode's heat curve is kept live by the writes themselves (heat/ddb.ts); there is nothing to rebuild.
import type { Db } from '../db/db.ts';

/**
 * Kept for the write paths that call it after a comment or reaction change: the marks and the curve are
 * updated inside the writing transaction (`addHeatMark` / `removeHeatMark`), and comments parked without an
 * episode length are placed by the `heat.place` job that `writeEpisode` enqueues.
 */
export async function rebuildEpisodeHeat(_db: Db, _episodeId: string): Promise<void> {}
