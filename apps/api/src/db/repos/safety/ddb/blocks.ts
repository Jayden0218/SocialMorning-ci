// Blocks on DynamoDB: both directions in the two listeners' partitions, the dashboard counter, the Postgres bridge row.
/**
 * M26 lane SF (SF-07…SF-13; data-model.md §3 `BLOCK#` / `BLOCKEDBY#`). A block is two items written in one
 * TransactWriteItems — `L#<blocker>/BLOCK#<blocked>` (with G4 `Q#blocks`, the dashboard recount's list) and
 * `L#<blocked>/BLOCKEDBY#<blocker>` — plus the hour's `R#dash#blocks` counter (dash.ts). The viewer's whole safety
 * set is a Query of their own partition, strongly consistent (they read their own block at once).
 * The follows both ways are lane SG's: its `endFollowsBetween` ends them right after the block commits (idempotent).
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { dashAdd } from './dash.ts';
import { endFollowsBetween } from '../../social/graph-ddb/index.ts';
import { bridgeOf, listenersById, nowIso, partition, type Db, type Item, type Store } from './common.ts';

const blocksOf = (store: Store, viewerId: string): Promise<Item[]> => partition(store, 'main', K.L(viewerId), { prefix: K.LISTENER_SK.blocks });

export async function block(store: Store, db: Db, blockerId: string, blockedId: string): Promise<'blocked' | 'no_such_listener'> {
  if (!(await get(store, 'main', K.listener(blockedId)))) return 'no_such_listener';
  const at = nowIso(store);
  const t = tx(store)
    .put('main', encode('block', K.block(blockerId, blockedId), { blockedId, createdAt: at }, { gsi: K.G4('blocks', at, `${blockerId}#${blockedId}`) }), { condition: 'attribute_not_exists(PK)', label: 'block' })
    .put('main', encode('blockedBy', K.blockedBy(blockedId, blockerId), { blockerId, createdAt: at }));
  // RED CHECK (G-M26-SF4)
  await db.transaction(async (txdb) => {
    const raw = bridgeOf(txdb);
    if (raw) await raw.query('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [blockerId, blockedId, at]);
    try {
      await t.commit();
    } catch (e) {
      // Already blocked: the SQL's ON CONFLICT DO NOTHING (the follows still go).
      if (!(e instanceof TxCancelled && e.failed('block'))) throw e;
    }
  });
  // The follows both ways end (lane SG's items and counters — with their own Postgres bridge), also when already blocked.
  await endFollowsBetween(store, db, blockerId, blockedId);
  return 'blocked';
}

/** FR-010: visibility returns; the follow does not. */
export async function unblock(store: Store, db: Db, blockerId: string, blockedId: string): Promise<void> {
  const it = await get(store, 'main', K.block(blockerId, blockedId));
  if (it) {
    const t = tx(store)
      .delete('main', K.block(blockerId, blockedId), { condition: 'attribute_exists(PK)', label: 'block' })
      .delete('main', K.blockedBy(blockedId, blockerId));
    dashAdd(t, 'blocks', String(it['createdAt']), -1);
    try { await t.commit(); } catch (e) { if (!(e instanceof TxCancelled && e.failed('block'))) throw e; }
  }
  const raw = bridgeOf(db);
  if (raw) await raw.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
}

export async function blockedIdsFor(store: Store, _db: Db, viewerId: string): Promise<Set<string>> {
  return new Set((await blocksOf(store, viewerId)).map((b) => String(b['blockedId'])));
}

export async function listBlocks(store: Store, _db: Db, viewerId: string): Promise<{ id: string; displayName: string; createdAt: string }[]> {
  const items = await blocksOf(store, viewerId);
  const names = await listenersById(store, items.map((b) => String(b['blockedId'])));
  return items
    .flatMap((b) => { const l = names.get(String(b['blockedId'])); return l ? [{ id: String(b['blockedId']), displayName: String(l['displayName']), createdAt: new Date(String(b['createdAt'])).toISOString() }] : []; })
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
}

/** Everyone on the other side of a block with `id`, either direction (lane SG's lists) — one strong Query of `id`'s partition. */
export async function blockedEitherWay(store: Store, id: string): Promise<Set<string>> {
  const items = await partition(store, 'main', K.L(id), { prefix: 'BLOCK' }); // BLOCK# and BLOCKEDBY#
  return new Set(items.map((i) => String(i['blockedId'] ?? i['blockerId'])));
}

/** Has `a` blocked `b`? */
export async function isBlockedBy(store: Store, _db: Db, a: string, b: string): Promise<boolean> {
  return Boolean(await get(store, 'main', K.block(a, b)));
}

/** The viewer's newest block or report — part of the social poll's ETag (R1). Both are own writes: base-table reads. */
export async function safetyStamp(store: Store, _db: Db, viewerId: string): Promise<string> {
  const blocks = await blocksOf(store, viewerId);
  const [report] = await partition(store, 'main', K.L(viewerId), { prefix: K.SF_SK.reporterMarks, newestFirst: true, max: 1 });
  const times = [...blocks.map((b) => String(b['createdAt'])), ...(report ? [String(report['createdAt'])] : [])];
  return times.length ? times.reduce((m, x) => (x > m ? x : m)) : '-';
}
