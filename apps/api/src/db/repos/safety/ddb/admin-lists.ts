// Admin's hidden-show list on DynamoDB: the hidden-feed items, the show title from the show item, "by a report" from the action.
/**
 * `CFG#hidden-feeds`
 * holds one item per admin hide (`PUB#…` items there are publishers' `itunes:block` marks, not hides — left out, as the
 * old table held only hides). `by_report` = the hiding action closed a report: act() keeps the first open report's copy
 * (`snapshot`) on the action item exactly when it had one to close (moderation.ts), so the SQL's
 * `EXISTS (reports WHERE closed_by = action_id)` is "the action item has a snapshot".
 */
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { get, update } from '../../../ddb/store.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import type { HiddenShowRow } from '../../admin/admin-lists.ts';
import { partition, type Db, type Store } from './common.ts';

export async function hiddenShowRows(store: Store, _db: Db): Promise<HiddenShowRow[]> {
  const hides = (await partition(store, 'main', 'CFG#hidden-feeds')).filter((i) => !String(i['SK']).startsWith('PUB#') && typeof i['feedUrl'] === 'string')
    .sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? 1 : String(a['createdAt']) > String(b['createdAt']) ? -1 : 0)).slice(0, 500);
  const [shows, actions] = await Promise.all([
    batchGetAll(store, 'main', [...new Set(hides.map((h) => String(h['feedUrl'])))].map((u) => K.show(u))),
    batchGetAll(store, 'main', [...new Set(hides.flatMap((h) => (h['actionId'] ? [String(h['actionId'])] : [])))].map((id) => K.moderationAction(id))),
  ]);
  const title = new Map(shows.map((s) => [String(s['feedUrl']), (s['newestTitle'] as string | undefined) ?? null]));
  const byReport = new Set(actions.filter((a) => a['snapshot'] !== undefined && a['snapshot'] !== null).map((a) => String(a['id'])));
  return hides.map((h) => ({
    feed_url: String(h['feedUrl']), reason: (h['reason'] as string | null | undefined) ?? null, hidden_at: String(h['createdAt']),
    title: title.get(String(h['feedUrl'])) ?? null, by_report: byReport.has(String(h['actionId'] ?? '')),
  }));
}

export async function hiddenFeedRow(store: Store, _db: Db, url: string): Promise<{ reason: string | null; hidden_at: Date | string }[]> {
  const h = await get(store, 'main', K.hiddenFeed(url), { consistent: true });
  return h ? [{ reason: (h['reason'] as string | null | undefined) ?? null, hidden_at: String(h['createdAt']) }] : [];
}

export async function setHiddenFeedReason(store: Store, _db: Db, url: string, why: string): Promise<void> {
  try {
    await update(store, 'main', K.hiddenFeed(url), { update: 'SET #r = :r', condition: 'attribute_exists(PK)', names: { '#r': 'reason' }, values: { ':r': why } });
  } catch (e) { if (!isConditionFailed(e)) throw e; } // the SQL UPDATE matched no row: nothing happens
}
