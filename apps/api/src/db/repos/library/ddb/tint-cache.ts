// The cover tint's cache entries on DynamoDB (`tint:<imageUrl>` in sm-cache) — LB-68/69.
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import type { Store } from '../../../ddb/store.ts';
import * as pg from '../../tint-cache.ts';
import type { TintCacheRow } from '../../tint-cache.ts';
import { cacheRows, writeEntry } from './cache.ts';

export async function tintCacheRows(store: Store, _db: Db, key: string): Promise<TintCacheRow[]> {
  return (await cacheRows(store, key)) as unknown as TintCacheRow[];
}

export async function writeTintCache(store: Store, db: Db, key: string, bodyJson: string, atMs: number): Promise<void> {
  await writeEntry(store, key, JSON.parse(bodyJson), atMs);
  const raw = bridgeOf(db);
  if (raw) await pg.writeTintCache(raw, key, bodyJson, atMs);
}
