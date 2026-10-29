// The app settings an admin may change (`app_config`): read, save with a version check, reset to default.
/**
 * M25 A7. One JSON value per key; the shape is checked before a save by `checkConfig`
 * (packages/social-core/src/app-config.ts). A key with no row is at its default (today's app).
 * `publicConfig` is what `GET /v1/config` serves, memoised per database for 30 s and dropped
 * on every admin save in this process.
 */
import { createHash } from 'node:crypto';
import { CONFIG_DEFAULTS, readConfig, type AppConfig, type ConfigKey } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { viaStore } from '../../backend.ts';
import { log } from '../../../log.ts';

export type ConfigRow = { key: ConfigKey; value: unknown; version: number; updatedAt: string };

/** A value stored as a JSON string (the M14 lesson) is parsed once more. */
export const parsed = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v) as unknown; } catch { return v; }
};

export async function getConfigRow(db: Db, key: ConfigKey): Promise<ConfigRow | null> {
  return (await listConfigRows(db)).find((r) => r.key === key) ?? null;
}

export const versionGuard = (current: number, sent: number) => {
  if (current !== sent) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
};

export type PublicConfig = { config: AppConfig; version: number; updatedAt: string | null };

const MEMO_MS = 30_000;
const memo = new WeakMap<Db, { at: number; body: PublicConfig; etag: string }>();

export function dropConfigMemo(db: Db): void {
  memo.delete(db);
}

/**
 * The whole config the phone reads: each saved key that still passes the check, the default for
 * the rest. A database that cannot be read answers the defaults (degrade, never fail start-up).
 */
export async function publicConfig(db: Db, now = Date.now()): Promise<{ body: PublicConfig; etag: string }> {
  const hit = memo.get(db);
  if (hit && now - hit.at < MEMO_MS) return hit;
  let rows: ConfigRow[] = [];
  try {
    rows = await listConfigRows(db);
  } catch (e) {
    log.warn('app_config_read_failed', { error: e });
  }
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  const body: PublicConfig = {
    config: rows.length === 0 ? CONFIG_DEFAULTS : readConfig(raw),
    version: rows.reduce((n, r) => n + r.version, 0),
    updatedAt: rows.reduce<string | null>((m, r) => (m === null || r.updatedAt > m ? r.updatedAt : m), null),
  };
  const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 16)}"`;
  const out = { at: now, body, etag };
  memo.set(db, out);
  return out;
}

export const listConfigRows = viaStore<typeof import('../safety/ddb/app-config.ts').listConfigRows>('sf/app-config', 'listConfigRows');
export const putConfig = viaStore<typeof import('../safety/ddb/app-config.ts').putConfig>('sf/app-config', 'putConfig');
export const resetConfig = viaStore<typeof import('../safety/ddb/app-config.ts').resetConfig>('sf/app-config', 'resetConfig');
