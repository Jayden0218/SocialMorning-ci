// The heat curve on DynamoDB: 100 buckets per episode, a listener counted once per bucket, kept in the writing transaction.
/**
 * M26 lane LB, data-model.md §6. The constitution's rule: 100 fixed buckets per episode, one count per
 * listener per bucket, across reactions AND timestamped comments.
 *
 * - `EP#<id> / HEAT`: `b` = list of 100 numbers, `v` = version.
 * - `EP#<id> / HM#<bb>#<listenerId>`: `refs` = how many of this listener's things sit in bucket bb (a reaction
 *   counts 1, each visible timestamped comment 1).
 *
 * `addHeatMark` / `removeHeatMark` are the shared helpers lane SC (reactions, comments) and ST (host hide)
 * call: they read the mark strongly, then write ONE TransactWriteItems = [the caller's own item(s) via `also`]
 * + [the mark, conditioned on the refs just read] + [the curve, only when the mark goes 0 → 1 or 1 → 0].
 * A racing writer fails the mark's condition (or AWS cancels with TransactionConflict) and the whole step is
 * retried from a fresh read — so two taps by one listener in one bucket can never count twice (guard G-M26-LB1).
 *
 * `replaceHeat` writes a whole curve from a set of marks (rebuild after a duration becomes known, and the
 * Postgres bridge while comments/reactions still live there); `repairHeat` recomputes `b` from the marks
 * (the nightly repair, §6).
 */
import { encode } from '../db/ddb/codec.ts';
import * as K from '../db/ddb/keys.ts';
import { queryAll } from '../db/ddb/paginate.ts';
import { withRetry } from '../db/ddb/retry.ts';
import { batchWriteAll, type WriteRequest } from '../db/ddb/batch.ts';
import { get, isoNow, put, type Item, type Store } from '../db/ddb/store.ts';
import { tx, TxCancelled, type Tx } from '../db/ddb/tx.ts';
import { registerHandler } from '../jobs/outbox.ts';

export const BUCKETS = 100;

/** The bucket of a moment: least(99, floor(offset × 100 / duration)) — the SQL rule, unchanged. */
export const bucketOf = (offsetMs: number, durationMs: number): number => Math.min(BUCKETS - 1, Math.floor((offsetMs * 100) / durationMs));

export type Mark = { episodeId: string; listenerId: string; bucket: number };

const zeros = (): number[] => Array.from({ length: BUCKETS }, () => 0);

/** The curve: 100 numbers, zeros when nobody has marked anything. One strong GetItem. */
export async function heatCurve(store: Store, episodeId: string): Promise<number[]> {
  const it = await get(store, 'main', K.heat(episodeId));
  const b = (it?.['b'] as number[] | undefined) ?? zeros();
  return b.map((n) => Number(n));
}

/** Only the curve and mark conditions are worth a retry; a failed condition on the caller's own item is an answer. */
function heatRetryable(e: unknown): boolean {
  if (!(e instanceof TxCancelled)) return false;
  if (e.conflict) return true;
  const failed = e.failedLabels();
  return failed.length > 0 && failed.every((l) => l.startsWith('heat:'));
}

function curveStep(t: Tx, store: Store, heat: Item | undefined, m: Mark, delta: 1 | -1): void {
  const bb = K.bucket(m.bucket);
  if (!heat) {
    // The first mark of an episode makes its curve (a removal with no curve has nothing to take away).
    if (delta < 0) return;
    const b = zeros();
    b[m.bucket] = 1;
    t.put('main', encode('heat', K.heat(m.episodeId), { episodeId: m.episodeId, b, v: 1, updatedAt: isoNow(store.clock) }), {
      condition: 'attribute_not_exists(PK)', label: 'heat:curve',
    });
    return;
  }
  t.update('main', K.heat(m.episodeId), {
    update: `SET #b[${Number(bb)}] = #b[${Number(bb)}] + :d, #v = #v + :one, #u = :now`,
    condition: 'attribute_exists(PK)',
    names: { '#b': 'b', '#v': 'v', '#u': 'updatedAt' },
    values: { ':d': delta, ':one': 1, ':now': isoNow(store.clock) },
    label: 'heat:curve',
  });
}

/**
 * One more of this listener's things in bucket `m.bucket`. `also` adds the caller's item (the reaction or
 * the comment) to the same transaction; it is called again on every retry with a fresh Tx.
 */
export async function addHeatMark(store: Store, m: Mark, also?: (t: Tx) => void): Promise<void> {
  await withRetry(async () => {
    const [hm, heat] = await Promise.all([get(store, 'main', K.heatMark(m.episodeId, m.bucket, m.listenerId)), get(store, 'main', K.heat(m.episodeId))]);
    const seen = Number(hm?.['refs'] ?? 0);
    const t = tx(store);
    also?.(t);
    if (seen === 0) {
      t.put('main', encode('heatMark', K.heatMark(m.episodeId, m.bucket, m.listenerId), { episodeId: m.episodeId, listenerId: m.listenerId, bucket: m.bucket, refs: 1 }), {
        condition: 'attribute_not_exists(PK)', label: 'heat:mark',
      });
      curveStep(t, store, heat, m, 1);
    } else {
      t.update('main', K.heatMark(m.episodeId, m.bucket, m.listenerId), {
        update: 'SET #r = :n', condition: '#r = :seen', names: { '#r': 'refs' }, values: { ':n': seen + 1, ':seen': seen }, label: 'heat:mark',
      });
    }
    await t.commit();
  }, { tries: 6, retryOn: heatRetryable });
}

/** One fewer of this listener's things in the bucket; the curve drops only when the last one goes. */
export async function removeHeatMark(store: Store, m: Mark, also?: (t: Tx) => void): Promise<void> {
  await withRetry(async () => {
    const [hm, heat] = await Promise.all([get(store, 'main', K.heatMark(m.episodeId, m.bucket, m.listenerId)), get(store, 'main', K.heat(m.episodeId))]);
    const seen = Number(hm?.['refs'] ?? 0);
    const t = tx(store);
    also?.(t);
    if (seen === 1) {
      t.delete('main', K.heatMark(m.episodeId, m.bucket, m.listenerId), { condition: '#r = :seen', names: { '#r': 'refs' }, values: { ':seen': 1 }, label: 'heat:mark' });
      curveStep(t, store, heat, m, -1);
    } else if (seen > 1) {
      t.update('main', K.heatMark(m.episodeId, m.bucket, m.listenerId), {
        update: 'SET #r = :n', condition: '#r = :seen', names: { '#r': 'refs' }, values: { ':n': seen - 1, ':seen': seen }, label: 'heat:mark',
      });
    }
    await t.commit();
  }, { tries: 6, retryOn: heatRetryable });
}

/** Every mark item of an episode (one Query on the episode partition). */
export async function heatMarks(store: Store, episodeId: string): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :hm)',
    ExpressionAttributeValues: { ':pk': K.EP(episodeId), ':hm': 'HM#' },
    ConsistentRead: true,
  });
  return items;
}

const curveOf = (marks: Iterable<{ bucket: number; refs: number }>): number[] => {
  const b = zeros();
  for (const m of marks) if (m.refs > 0) b[m.bucket] = (b[m.bucket] ?? 0) + 1;
  return b;
};

/**
 * Replaces an episode's marks and curve with exactly `marks` (refs per listener per bucket). Not one
 * transaction (an episode can have thousands of marks): marks first, the curve last, so a reader sees the
 * old curve or the new one. Used by the rebuild and by the Postgres bridge.
 */
export async function replaceHeat(store: Store, episodeId: string, marks: readonly { listenerId: string; bucket: number; refs: number }[]): Promise<number[]> {
  const want = new Map(marks.filter((m) => m.refs > 0).map((m) => [`${K.bucket(m.bucket)}#${m.listenerId}`, m]));
  const have = await heatMarks(store, episodeId);
  const writes: WriteRequest[] = [];
  for (const it of have) {
    const id = String(it['SK']).slice(3);
    const w = want.get(id);
    if (!w) writes.push({ delete: { PK: String(it['PK']), SK: String(it['SK']) } });
    else if (Number(it['refs']) === w.refs) want.delete(id);
  }
  for (const m of want.values()) {
    writes.push({ put: encode('heatMark', K.heatMark(episodeId, m.bucket, m.listenerId), { episodeId, listenerId: m.listenerId, bucket: m.bucket, refs: m.refs }) });
  }
  await batchWriteAll(store, 'main', writes);
  const b = curveOf(marks);
  const cur = await get(store, 'main', K.heat(episodeId));
  await put(store, 'main', encode('heat', K.heat(episodeId), { episodeId, b, v: Number(cur?.['v'] ?? 0) + 1, updatedAt: isoNow(store.clock) }));
  return b;
}

/** §6 repair: recompute the curve from the marks; writes only when it differs. */
export async function repairHeat(store: Store, episodeId: string): Promise<{ before: number[]; after: number[]; fixed: boolean }> {
  const marks = (await heatMarks(store, episodeId)).map((it) => ({ bucket: Number(it['bucket']), refs: Number(it['refs']) }));
  const after = curveOf(marks);
  const before = await heatCurve(store, episodeId);
  const fixed = before.some((n, i) => n !== after[i]);
  if (fixed) {
    const cur = await get(store, 'main', K.heat(episodeId));
    await put(store, 'main', encode('heat', K.heat(episodeId), { episodeId, b: after, v: Number(cur?.['v'] ?? 0) + 1, updatedAt: isoNow(store.clock) }));
  }
  return { before, after, fixed };
}

/** Outbox kind written in the episode's transaction when its duration first becomes known. */
export const HEAT_PLACE = 'heat.place';

/**
 * §6 "parked comments": comments posted before the duration was known carry `offsetMs` but no `bucket`.
 * When the duration arrives, this places each one (its own `bucket` set with `attribute_not_exists`, so a
 * second run is a no-op — outbox handlers must be idempotent). A deleted or host-hidden comment is not counted.
 */
export async function placeParkedComments(store: Store, episodeId: string): Promise<number> {
  const ep = await get(store, 'main', K.episode(episodeId));
  const duration = Number(ep?.['durationMs'] ?? 0);
  if (!(duration > 0)) return 0;
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :c)',
    FilterExpression: 'attribute_exists(#o) AND attribute_not_exists(#b) AND attribute_type(#o, :num)',
    ExpressionAttributeNames: { '#b': 'bucket', '#o': 'offsetMs' },
    ExpressionAttributeValues: { ':pk': K.EP(episodeId), ':c': 'C#', ':num': 'N' },
    ConsistentRead: true,
  });
  let placed = 0;
  for (const c of items) {
    if (c['deletedAt'] || c['hostHiddenAt'] || !c['authorId']) continue;
    const bucket = bucketOf(Number(c['offsetMs']), duration);
    const key = { PK: String(c['PK']), SK: String(c['SK']) };
    try {
      await addHeatMark(store, { episodeId, listenerId: String(c['authorId']), bucket }, (t) => {
        t.update('main', key, { update: 'SET #b = :b', condition: 'attribute_exists(PK) AND attribute_not_exists(#b)', names: { '#b': 'bucket' }, values: { ':b': bucket }, label: 'comment:place' });
      });
      placed++;
    } catch (e) {
      if (!(e instanceof TxCancelled && e.failed('comment:place'))) throw e;
    }
  }
  return placed;
}

registerHandler(HEAT_PLACE, async (store, entry) => { await placeParkedComments(store, String(entry.payload['episodeId'])); });
