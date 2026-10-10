// Playback positions on DynamoDB: L#<id>/POS#<episodeId>, merged with mergePosition under a version check.
/**
 * M26 lane LB, LB-T04 (patterns LB-18…23), data-model.md §10: "GetItem (strong), run the same
 * `mergePosition` from packages/social-core, Put with `v = :read` condition, retry".
 *
 * The constitution's rule for positions: the server keeps the merged position by playback progress
 * (`mergePosition`: progress never goes backwards, finished is sticky, a newer explicit seek wins) — never
 * the last write on the wall clock. Under Postgres the row lock (`FOR UPDATE`) made the read-merge-write
 * atomic; here the version condition does: if another write landed between our read and our write, our Put
 * fails and we merge again against what is there now (guard G-M26-LB3: a late, older observation can never
 * replace a further one).
 */
import { mergePosition, type PositionObs } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll, batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { get, put, type Item, type Store } from '../../../ddb/store.ts';
import * as pg from '../positions.ts';
import type { PositionRow } from '../positions.ts';

export function positionRow(it: Item): PositionRow {
  return {
    episode_id: String(it['episodeId']), offset_ms: Number(it['offsetMs']), finished: it['finished'] === true,
    progress_seq: Number(it['progressSeq']), explicit_seek: it['explicitSeek'] === true, device_id: String(it['deviceId']),
    received_at: String(it['receivedAt']),
  };
}

/** One observation merged against the stored item; written only when the merge changes it. */
export async function observeOne(store: Store, listenerId: string, deviceId: string, o: Omit<PositionObs, 'receivedAt'>, now: Date): Promise<PositionRow> {
  return withVersionRetry(async () => {
    const cur = await get(store, 'main', K.position(listenerId, o.episodeId));
    const existing = cur ? positionRow(cur) : undefined;
    const stored = existing ? pg.toObs(existing) : null;
    const incoming: PositionObs = { ...o, receivedAt: now.getTime() };
    const winner = mergePosition(stored, incoming);
    // As the Postgres body: a winner stamped with this request's time counts as the incoming one.
    const incomingWon = winner.receivedAt === incoming.receivedAt;
    if (existing && !incomingWon && winner.finished === existing.finished) return existing;
    const row: PositionRow = {
      episode_id: o.episodeId, offset_ms: winner.offsetMs, finished: winner.finished, progress_seq: winner.progressSeq, explicit_seek: winner.explicitSeek,
      device_id: winner === incoming || winner.receivedAt === incoming.receivedAt ? deviceId : existing!.device_id,
      received_at: new Date(winner.receivedAt).toISOString(),
    };
    const v = Number(cur?.['v'] ?? 0);
    await put(store, 'main', encode('position', K.position(listenerId, o.episodeId), {
      listenerId, episodeId: row.episode_id, offsetMs: row.offset_ms, finished: row.finished, progressSeq: row.progress_seq,
      explicitSeek: row.explicit_seek, deviceId: row.device_id, receivedAt: row.received_at, v: v + 1,
    }), cur
      ? { condition: '#v = :seen', names: { '#v': 'v' }, values: { ':seen': v } }
      : { condition: 'attribute_not_exists(PK)' });
    return row;
  }, { tries: 5 });
}

export async function observePosition(store: Store, db: Db, listenerId: string, deviceId: string, o: Omit<PositionObs, 'receivedAt'>, now: Date): Promise<PositionRow> {
  const row = await observeOne(store, listenerId, deviceId, o, now);
  const raw = bridgeOf(db);
  if (raw) await pg.observePosition(raw, listenerId, deviceId, o, now);
  return row;
}

/** In order, one conditional write each (the old single transaction held row locks; each write here is atomic on its own). */
export async function observePositions(store: Store, db: Db, listenerId: string, deviceId: string, observations: readonly Omit<PositionObs, 'receivedAt'>[], now: Date): Promise<PositionRow[]> {
  const out: PositionRow[] = [];
  for (const o of observations) out.push(await observeOne(store, listenerId, deviceId, o, now));
  const raw = bridgeOf(db);
  if (raw) await pg.observePositions(raw, listenerId, deviceId, observations, now);
  return out;
}

async function allPositions(store: Store, listenerId: string): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': K.LISTENER_SK.positions },
    ConsistentRead: true,
  });
  return items;
}

/** Newest first; `since` keeps rows received after it. One Query of the listener's own partition. */
export async function listPositions(store: Store, _db: Db, listenerId: string, since?: Date): Promise<PositionRow[]> {
  const rows = (await allPositions(store, listenerId)).map(positionRow);
  const after = since ? rows.filter((r) => Date.parse(String(r.received_at)) > since.getTime()) : rows;
  return after.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
}

/** LB-21: which of these episode ids the server knows (BatchGet of the episodes' META). */
export async function knownEpisodeIds(store: Store, _db: Db, ids: string[]): Promise<{ id: string }[]> {
  const found = await batchGetAll(store, 'main', [...new Set(ids)].map((id) => K.episode(id)));
  return found.map((it) => ({ id: String(it['id'] ?? String(it['PK']).slice(3)) }));
}

export async function deleteAllPositions(store: Store, db: Db, listenerId: string): Promise<void> {
  const items = await allPositions(store, listenerId);
  await batchWriteAll(store, 'main', items.map((it) => ({ delete: { PK: String(it['PK']), SK: String(it['SK']) } })));
  const raw = bridgeOf(db);
  if (raw) await pg.deleteAllPositions(raw, listenerId);
}

export async function deletePositionsFor(store: Store, db: Db, listenerId: string, episodeIds: string[]): Promise<void> {
  await batchWriteAll(store, 'main', [...new Set(episodeIds)].map((id) => ({ delete: K.position(listenerId, id) })));
  const raw = bridgeOf(db);
  if (raw) await pg.deletePositionsFor(raw, listenerId, episodeIds);
}
