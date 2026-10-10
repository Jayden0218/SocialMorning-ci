// Lane ST's timed work on DynamoDB: scheduled Studio episodes go live, and once a day the rollups are checked against a recount.
/**
 * M26 lane ST (ST-T02, ST-T05). Called by the hourly `sweep` step (routes/internal.ts); production may also call
 * `promoteScheduled` from a 1-minute schedule (lane OPS). On Postgres there is nothing to do: the old code promoted
 * on read, which the DynamoDB code also still does.
 *  - `promoteScheduled`: every hosted episode on G4 `Q#scheduled` whose time has come goes live — once (G-M26-ST1).
 *  - `checkRollups`: yesterday's (UTC) Studio rollups against a recount of the facts, repaired where they differ —
 *    once a day (`U#LOCK#st-rollups#<day>`).
 */
import type { Db } from '../db/db.ts';
import { ATTACHED } from '../db/backend.ts';

export async function studioSweep(db: Db): Promise<{ promoted: number; rollupsFixed: number }> {
  const on = ATTACHED.get(db);
  if (!on) return { promoted: 0, rollupsFixed: 0 };
  const [{ promoteScheduled }, { checkRollups }, K, { tx, TxCancelled }] = await Promise.all([
    import('../db/repos/studio/ddb/hosted.ts'), import('../db/repos/studio/ddb/facts.ts'), import('../db/ddb/keys.ts'), import('../db/ddb/tx.ts'),
  ]);
  const promoted = await promoteScheduled(on.store, db);
  const day = new Date(on.store.clock.now() - 86_400_000).toISOString().slice(0, 10);
  let rollupsFixed = 0;
  try {
    const { encode } = await import('../db/ddb/codec.ts');
    await tx(on.store).put('main', encode('unique', K.U.lock(`st-rollups#${day}`), { owner: 'studio-nightly' }, { ttl: Math.floor(on.store.clock.now() / 1000) + 3 * 86_400 }), { condition: 'attribute_not_exists(PK)', label: 'lock' }).commit();
    rollupsFixed = await checkRollups(on.store, day);
  } catch (e) {
    if (!(e instanceof TxCancelled && e.failed('lock'))) throw e;
  }
  return { promoted, rollupsFixed };
}
