// App settings on DynamoDB: one item per key in `CFG#app-config`, saved and reset with a version condition.
/**
 * M26 lane SF (data-model.md "Lane SF changes"). `K.appConfig(key)` = `CFG#app-config` / `<key>`, type
 * `appConfig` {key, value, version, updatedAt}. `value` is the JSON value itself (DocumentClient maps/lists);
 * a value that arrives as a JSON STRING is still parsed once on read (`parsed` — the M14 lesson).
 * A save or reset reads the item strongly, checks the version in code (409 `changed`), then writes ONE Tx
 * with the same check as a condition (label `config`) through `commitOrDefer`, so inside adminWrite it joins
 * the audit record's transaction and a race fails with the same 409.
 */
import { isConfigKey, type ConfigKey } from '@socialmorning/social-core';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import { parsed, versionGuard, type ConfigRow } from '../../config/app-config.ts';
import { commitOrDefer } from './admin-scope.ts';
import { nowIso, partition, txa, type Db, type Store } from './common.ts';

const PK = K.appConfig('x').PK;
const changed = (current: number) => () => new ApiError('changed', 'Changed elsewhere — reload.', { version: current });

export async function listConfigRows(store: Store, _db: Db): Promise<ConfigRow[]> {
  const items = await partition(store, 'main', PK);
  return items
    .filter((i) => isConfigKey(String(i['key'])))
    .map((i) => ({
      key: String(i['key']) as ConfigKey, value: parsed(i['value']), version: Number(i['version']),
      updatedAt: new Date(String(i['updatedAt'])).toISOString(),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

async function currentVersion(store: Store, key: ConfigKey): Promise<number> {
  const i = await get(store, 'main', K.appConfig(key));
  return i ? Number(i['version']) : 0;
}

/** The stored item still has version `current` (0 = there is none). */
const sameVersion = (current: number) => (current === 0
  ? { condition: 'attribute_not_exists(PK)' }
  : { condition: 'version = :cur', values: { ':cur': current } });

export async function putConfig(store: Store, _db: Db, key: ConfigKey, version: number, value: unknown): Promise<number> {
  const current = await currentVersion(store, key);
  versionGuard(current, version);
  const next = current + 1;
  const t = txa(store).put('main', encode('appConfig', K.appConfig(key), { key, value, version: next, updatedAt: nowIso(store) }), { ...sameVersion(current), label: 'config' });
  await commitOrDefer(store, t.raw, { config: changed(current) });
  return next;
}

export async function resetConfig(store: Store, _db: Db, key: ConfigKey, version: number): Promise<void> {
  const current = await currentVersion(store, key);
  versionGuard(current, version);
  const t = txa(store).delete('main', K.appConfig(key), { ...sameVersion(current), label: 'config' });
  await commitOrDefer(store, t.raw, { config: changed(current) });
}
