// The owner's For You rules: boost, bury or never recommend a show; and the ranking weights.
/**
 * M25 A6 (lane AL). Read by `buildForYou` (foryou.ts): a `never` show leaves every listener's
 * list (also at serve time, so a cached list obeys at once); `boost` adds RULE_BOOST to each of
 * its episodes' scores and `bury` takes RULE_BURY off. The weights replace rank.ts's constants
 * (`cleanWeights` keeps them inside WEIGHT_BOUNDS; no row = the defaults). Every admin save drops
 * the cached lists (`dropForYouCache`), so the next request is rebuilt with them.
 */
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { invalidateCachePrefix } from '../cache.ts';

export const RULES = ['boost', 'bury', 'never'] as const;
export type Rule = (typeof RULES)[number];
export type RuleRow = { feedUrl: string; rule: Rule; note: string | null; createdAt: string; title: string | null };

/**
 * Every cached For You list (signed in and signed out); the shared chart channel stays (its key, `foryou-chart`, is
 * outside the prefix). M26 lane DV: lane LB's `invalidateCachePrefix` (on DynamoDB the prefix's generation moves on).
 */
export async function dropForYouCache(db: Db): Promise<void> {
  await invalidateCachePrefix(db, 'foryou:');
}

// Each runs its DynamoDB body (ddb/foryou-rules.ts) on the Store the Db carries (db/backend.ts).
export const forYouRules = viaStore<typeof import('./ddb/foryou-rules.ts').forYouRules>('dv/foryou-rules', 'forYouRules');
export const listRules = viaStore<typeof import('./ddb/foryou-rules.ts').listRules>('dv/foryou-rules', 'listRules');
export const putRule = viaStore<typeof import('./ddb/foryou-rules.ts').putRule>('dv/foryou-rules', 'putRule');
export const deleteRule = viaStore<typeof import('./ddb/foryou-rules.ts').deleteRule>('dv/foryou-rules', 'deleteRule');
export const getWeights = viaStore<typeof import('./ddb/foryou-rules.ts').getWeights>('dv/foryou-rules', 'getWeights');
export const putWeights = viaStore<typeof import('./ddb/foryou-rules.ts').putWeights>('dv/foryou-rules', 'putWeights');
