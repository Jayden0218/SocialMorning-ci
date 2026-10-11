// The moved-feed job on DynamoDB: every live subscriber of the old address moves to the new one, 4 items per subscriber.
/**
 * M26 lane LB, LB-T09 (patterns LB-43…45), data-model.md §8 ("moved feed: resumable job, 4 items per
 * subscriber"). The old single transaction could touch every subscriber of a show; a TransactWriteItems
 * holds 100 items, so this is a job (`JOB#moved-feed#<id>`): each step takes up to 20 live subscribers of
 * the old address from G2 `SHSUBS#<old>` and, per subscriber, one transaction:
 *   old SUB → tombstone (only if still live) · new SUB → live (kept if already live; revived if a tombstone)
 *   · the two events (`SE#…` unsub / sub) · the two show counts.
 * A crash between steps leaves a half-moved show that the next run (or `resumeJobs`) finishes; a subscriber
 * already moved is skipped by the "still live" condition, so a step can run twice.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { get, isoNow, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { runJob, startJob, type JobStep } from '../../../../jobs/outbox.ts';
import * as pg from '../feeds.ts';
import { addFlip, subscriptionItem, subscriptionRow, syncFeedQueue } from './subscriptions.ts';

export const MOVED_FEED_JOB = 'moved-feed';
const PER_STEP = 20;

/** One subscriber moved; false when there was nothing to move (already moved, or no longer live). */
async function moveOne(store: Store, listenerId: string, from: string, to: string): Promise<boolean> {
  const [old, cur] = await Promise.all([get(store, 'main', K.subscription(listenerId, from)), get(store, 'main', K.subscription(listenerId, to))]);
  if (!old || old['deletedAt']) return false;
  const now = isoNow(store.clock);
  const oldRow = subscriptionRow(old);
  const oldV = Number(old['v'] ?? 0);
  const unsubId = await nextSeq(store, 'subscription_events', 2);
  const t = tx(store).put('main', subscriptionItem(listenerId, { ...oldRow, deleted_at: now }, oldV + 1), {
    condition: 'attribute_exists(PK) AND (attribute_not_exists(#d) OR attribute_type(#d, :nt))', names: { '#d': 'deletedAt' }, values: { ':nt': 'NULL' }, label: 'old',
  });
  addFlip(t, store, listenerId, from, 'unsub', unsubId, now);
  const curRow = cur ? subscriptionRow(cur) : undefined;
  if (!curRow || curRow.deleted_at !== null) {
    const curV = Number(cur?.['v'] ?? 0);
    const row = curRow ? { ...curRow, deleted_at: null, created_at: now } : { feed_url: to, starred: false, created_at: now, deleted_at: null, starred_at: null };
    t.put('main', subscriptionItem(listenerId, row, curV + 1), cur
      ? (cur['v'] === undefined ? { condition: 'attribute_not_exists(#v)', names: { '#v': 'v' }, label: 'new' } : { condition: '#v = :seen', names: { '#v': 'v' }, values: { ':seen': curV }, label: 'new' })
      : { condition: 'attribute_not_exists(PK)', label: 'new' });
  }
  // The history says both: they left the old address and arrived at the new one (as the SQL did, even when already live there).
  t.put('events', encode('subscriptionEvent', K.ev.subscriptionEvent(to, now, unsubId + 1), { id: unsubId + 1, listenerId, feedUrl: to, kind: 'sub', at: now }, { gsi: K.E1(now.slice(0, 10), 'se', `${K.feedKey(to)}#${unsubId + 1}`) }));
  if (!curRow || curRow.deleted_at !== null) {
    t.update('main', K.show(to), {
      update: 'SET #t = if_not_exists(#t, :show), #f = if_not_exists(#f, :f) ADD #c :d',
      names: { '#t': 't', '#f': 'feedUrl', '#c': 'subscriberCount' }, values: { ':show': 'show', ':f': to, ':d': 1 },
    });
  }
  try {
    await t.commit();
    return true;
  } catch (e) {
    if (e instanceof TxCancelled && e.conditionFailed) return false; // moved by another run meanwhile
    throw e;
  }
}

const step: JobStep = async (store, job) => {
  const from = String(job.state['from']);
  const to = String(job.state['to']);
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G2,
    KeyConditionExpression: 'G2PK = :p',
    ExpressionAttributeValues: { ':p': `SHSUBS#${K.feedKey(from)}` },
  }, { max: PER_STEP });
  let moved = Number(job.state['moved'] ?? 0);
  let progressed = 0;
  for (const it of items) {
    if (await moveOne(store, String(it['PK']).slice(2), from, to)) { moved++; progressed++; }
  }
  // An index that still lists already-moved rows (GSIs lag) cannot keep the job alive: no progress = done.
  const done = items.length < PER_STEP || progressed === 0;
  if (done) { await syncFeedQueue(store, from); await syncFeedQueue(store, to); }
  return { done, state: { from, to, moved } };
};

/** Runs the job to the end now (the hourly feed step waits for it, as it waited for the old transaction). */
export async function moveSubscriptionsToFeed(store: Store, db: Db, from: string, to: string): Promise<number> {
  const id = randomUUID();
  await startJob(tx(store), store, MOVED_FEED_JOB, id, { from, to, moved: 0 }).commit();
  await runJob(store, MOVED_FEED_JOB, id, step, { maxSteps: 1000 });
  const done = await get(store, 'main', K.job(MOVED_FEED_JOB, id));
  const moved = Number((done?.['state'] as Record<string, unknown> | undefined)?.['moved'] ?? 0);
  const raw = bridgeOf(db);
  if (raw) await pg.moveSubscriptionsToFeed(raw, from, to);
  return moved;
}

export { step as movedFeedStep };
