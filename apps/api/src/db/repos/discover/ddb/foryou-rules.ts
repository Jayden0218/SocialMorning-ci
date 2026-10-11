// The owner's For You rules and weights on DynamoDB: one partition of rules, one weights item with a version.
/**
 * M26 lane DV (DV-26…DV-34).
 * - Rules: `CFG#foryou-rules / <feedKey>` (type `forYouRule`): one Query reads them all; a save is a Put (the old
 *   upsert), a delete a Delete — each joins the admin record's transaction (lane SF's `commitOrDefer`).
 * - Weights: `CFG#foryou-weights / V` (type `forYouWeights`): `weights` (a map, kept inside the bounds by
 *   `cleanWeights`), `version`; a save/reset is conditioned on the version the editor loaded (the old `FOR UPDATE`).
 * - Show names for Admin come from lane LB's show META (`newestTitle` — newest by date, NULLs last, as the SQL).
 */
import { cleanWeights, DEFAULT_WEIGHTS, type Weights } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import type { Rule, RuleRow } from '../foryou-rules.ts';
import { nowIso, partitionItems } from './common.ts';

const RULES_PK = 'CFG#foryou-rules';
const WEIGHTS = () => K.config('foryou-weights');

export async function forYouRules(store: Store, _db: Db): Promise<Map<string, Rule>> {
  return new Map((await partitionItems(store, RULES_PK)).map((r) => [String(r['feedUrl']), r['rule'] as Rule]));
}

export async function listRules(store: Store, _db: Db): Promise<RuleRow[]> {
  const rows = await partitionItems(store, RULES_PK);
  const shows = new Map((await batchGetAll(store, 'main', rows.map((r) => K.show(String(r['feedUrl']))), { consistent: false })).map((s) => [String(s['feedUrl']), s]));
  return rows
    .map((r) => {
      const title = shows.get(String(r['feedUrl']))?.['newestTitle'];
      return { feedUrl: String(r['feedUrl']), rule: r['rule'] as Rule, note: (r['note'] as string | null | undefined) ?? null, createdAt: String(r['createdAt']), title: typeof title === 'string' ? title : null };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.feedUrl < b.feedUrl ? -1 : a.feedUrl > b.feedUrl ? 1 : 0));
}

export async function putRule(store: Store, _db: Db, feedUrl: string, rule: Rule, note: string | null, by: string): Promise<void> {
  await commitOrDefer(store, tx(store).put('main', encode('forYouRule', K.forYouRule(feedUrl), { feedUrl, rule, note, createdBy: by, createdAt: nowIso(store) })));
}

export async function deleteRule(store: Store, _db: Db, feedUrl: string): Promise<boolean> {
  if (!(await get(store, 'main', K.forYouRule(feedUrl)))) return false;
  await commitOrDefer(store, tx(store).delete('main', K.forYouRule(feedUrl)));
  return true;
}

export async function getWeights(store: Store, _db: Db): Promise<{ weights: Weights; version: number; saved: boolean }> {
  const it = await get(store, 'main', WEIGHTS());
  if (!it) return { weights: { ...DEFAULT_WEIGHTS }, version: 0, saved: false };
  return { weights: cleanWeights(it['weights']), version: Number(it['version']), saved: true };
}

export async function putWeights(store: Store, _db: Db, version: number, w: Partial<Weights> | null): Promise<number> {
  const cur = await get(store, 'main', WEIGHTS());
  const current = cur ? Number(cur['version']) : 0;
  const stale = () => new ApiError('changed', 'Changed elsewhere — reload.', { version: current + 1 });
  if (current !== version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  const cond = cur ? { condition: '#v = :cur', names: { '#v': 'version' }, values: { ':cur': current }, label: 'weights' } : { condition: 'attribute_not_exists(PK)', label: 'weights' };
  if (w === null) {
    if (cur) await commitOrDefer(store, tx(store).delete('main', WEIGHTS(), cond), { weights: stale });
    return 0;
  }
  const next = current + 1;
  await commitOrDefer(store, tx(store).put('main', encode('forYouWeights', WEIGHTS(), { weights: cleanWeights(w), version: next, updatedAt: nowIso(store) }), cond), { weights: stale });
  return next;
}
