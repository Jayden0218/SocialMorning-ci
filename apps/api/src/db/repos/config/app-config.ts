// The app settings an admin may change (`app_config`): read, save with a version check, reset to default.
/**
 * M25 A7. One JSON value per key; the shape is checked before a save by `checkConfig`
 * (packages/social-core/src/app-config.ts). A key with no row is at its default (today's app).
 * `publicConfig` is what `GET /v1/config` serves, memoised per database for 30 s and dropped
 * on every admin save in this process.
 */
import { createHash } from 'node:crypto';
import { CONFIG_DEFAULTS, isConfigKey, readConfig, type AppConfig, type ConfigKey } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { dual } from '../../backend.ts';

export type ConfigRow = { key: ConfigKey; value: unknown; version: number; updatedAt: string };

/** jsonb comes back parsed from both drivers; a value stored as a JSON string (the M14 lesson) is parsed once more. */
export const parsed = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v) as unknown; } catch { return v; }
};

async function listConfigRowsPg(db: Db): Promise<ConfigRow[]> {
  const rows = await db.query<{ key: string; value: unknown; version: number; updated_at: Date | string }>(
    'SELECT key, value, version, updated_at FROM app_config ORDER BY key');
  return rows.filter((r) => isConfigKey(r.key)).map((r) => ({
    key: r.key as ConfigKey, value: parsed(r.value), version: Number(r.version), updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function getConfigRow(db: Db, key: ConfigKey): Promise<ConfigRow | null> {
  return (await listConfigRows(db)).find((r) => r.key === key) ?? null;
}

export const versionGuard = (current: number, sent: number) => {
  if (current !== sent) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
};

/** Save `value` (already checked) when `version` is the stored one (0 = never saved). Returns the new version. */
async function putConfigPg(tx: Db, key: ConfigKey, version: number, value: unknown): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM app_config WHERE key = $1 FOR UPDATE', [key]);
  const current = cur ? Number(cur.version) : 0;
  versionGuard(current, version);
  const next = current + 1;
  await tx.query(
    `INSERT INTO app_config (key, value, version, updated_at) VALUES ($1, ($2::text)::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, version = EXCLUDED.version, updated_at = now()`,
    [key, JSON.stringify(value), next],
  );
  return next;
}

/** Back to the default: the row goes. */
async function resetConfigPg(tx: Db, key: ConfigKey, version: number): Promise<void> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM app_config WHERE key = $1 FOR UPDATE', [key]);
  versionGuard(cur ? Number(cur.version) : 0, version);
  await tx.query('DELETE FROM app_config WHERE key = $1', [key]);
}

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
    console.warn(`[config] read failed, serving defaults: ${e instanceof Error ? e.message : String(e)}`);
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

export const listConfigRows = dual('sf/app-config', 'listConfigRows', listConfigRowsPg);
export const putConfig = dual('sf/app-config', 'putConfig', putConfigPg);
export const resetConfig = dual('sf/app-config', 'resetConfig', resetConfigPg);
