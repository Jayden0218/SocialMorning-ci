// Lane SF's part of an account deletion (JOB#delete phase `safety`): blocks both ways, reports kept anonymous, appeals, role, app-use days.
/**
 * M26 lane SF, called by lane AC's deletion job (src/db/repos/account/ddb/deletion.ts) before the `partition` phase
 * deletes everything under `L#<id>`. Each step is idempotent (the job may run it again after a crash):
 * - blocks: the other side of each block (`BLOCKEDBY#` / `BLOCK#` in the other listener's partition) goes, and a
 *   block the listener made takes its hour back off the dashboard counter (ON DELETE CASCADE removed the row);
 * - reports they made stay, anonymous: `reporterId` → null (ON DELETE SET NULL); their own copies go with `L#`;
 * - appeals they sent go (ON DELETE CASCADE) — found through the actions about them (G5 subject);
 * - their admin role goes (the trigger allowed this one removal: the listener itself is deleted);
 * - their app-use days (`DA#<day>/<id>`, sm-events) go — M18 FR-015 "deleting the account deletes its days".
 * Finding 1 (a moderator's account cannot be deleted on Postgres: moderation_actions.actor_id has no ON DELETE
 * rule) is kept: the job's `others` phase still runs that cascade first and fails for a moderator, as today.
 */
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { update } from '../../../ddb/store.ts';
import { getMany, keyOf, nowMs, partition, type Item, type Store } from './common.ts';
import { dashAdd } from './dash.ts';
import { dropAdminOf } from './admin-access.ts';
import { closeReportItem, reportsAbout } from './reports.ts';

const klDay = (ms: number): string => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

export async function deleteSafetyOf(store: Store, listenerId: string): Promise<void> {
  // Blocks both ways.
  for (const b of await partition(store, 'main', K.L(listenerId), { prefix: K.LISTENER_SK.blocks })) {
    const other = String(b['blockedId']);
    const t = tx(store).delete('main', keyOf(b), { condition: 'attribute_exists(PK)', label: 'block' }).delete('main', K.blockedBy(other, listenerId));
    dashAdd(t, 'blocks', String(b['createdAt']), -1);
    try { await t.commit(); } catch (e) { if (!(e instanceof TxCancelled && e.failed('block'))) throw e; }
  }
  for (const b of await partition(store, 'main', K.L(listenerId), { prefix: K.LISTENER_SK.blockedBy })) {
    const other = String(b['blockerId']);
    const t = tx(store).delete('main', K.block(other, listenerId), { condition: 'attribute_exists(PK)', label: 'block' }).delete('main', keyOf(b));
    dashAdd(t, 'blocks', String(b['createdAt']), -1);
    try { await t.commit(); } catch (e) { if (!(e instanceof TxCancelled && e.failed('block'))) throw e; }
  }
  // M6 (US2 #8): open reports against their profile, comments and clips close as "author deleted" (G1 = the reported person).
  for (const r of await reportsAbout(store, listenerId, 10_000)) {
    if (r['closedAt'] || !['profile', 'comment', 'clip'].includes(String(r['targetKind']))) continue;
    await closeReportItem(store, r, null, 'author_deleted');
  }
  // Their reports stay, without them.
  const marks = await partition(store, 'main', K.L(listenerId), { prefix: K.SF_SK.reporterMarks });
  for (const m of marks) {
    await update(store, 'main', K.report(String(m['targetKind']), String(m['targetId']), listenerId), {
      update: 'SET #r = :null', condition: 'attribute_exists(PK)', names: { '#r': 'reporterId' }, values: { ':null': null },
    }).catch((e: unknown) => { if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e; });
  }
  // Their appeals.
  const { queryAll } = await import('../../../ddb/paginate.ts');
  const { items: refs } = await queryAll(store, 'main', { IndexName: K.INDEX.G5, KeyConditionExpression: 'G5PK = :r', ExpressionAttributeValues: { ':r': `REF#subject#${listenerId}` } });
  const appeals = (await getMany(store, 'main', refs.map((r: Item) => K.appeal(String(r['PK']).slice('MA#'.length))))).filter((a) => a['listenerId'] === listenerId);
  if (appeals.length) await batchWriteAll(store, 'main', appeals.map((a) => ({ delete: keyOf(a) })));
  // Their role.
  await dropAdminOf(store, listenerId);
  // Their app-use days (TTL 400 days: no older ones exist).
  const today = nowMs(store);
  const days = Array.from({ length: 402 }, (_, i) => klDay(today - i * 86_400_000));
  const found = await (await import('../../../ddb/batch.ts')).batchGetAll(store, 'events', days.map((d) => K.ev.dailyActive(d, listenerId)));
  if (found.length) await batchWriteAll(store, 'events', found.map((f) => ({ delete: keyOf(f) })));
}
