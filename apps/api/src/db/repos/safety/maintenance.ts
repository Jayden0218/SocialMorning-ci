// The maintenance switch the admin turns on and off: stored in app_settings, read through a short memo.
/**
 * M24 US4. `app_settings` row `maintenance` = `{ until, message }` while on; no row = off. It is on
 * only while `until` is in the future, so it ends by itself. Read on every API call through a
 * 10 s in-process memo per database; the admin's change drops the memo in this process at once.
 */
import type { Db } from '../../db.ts';

export type Maintenance = { until: string; message: string };

export const MAINTENANCE_KEY = 'maintenance';
export const MAINTENANCE_MESSAGE_MAX = 200;
export const DEFAULT_MAINTENANCE_MESSAGE = 'SocialNet is being updated.';
const MEMO_MS = 10_000;
const memo = new WeakMap<Db, { at: number; value: Maintenance | null }>();

export function dropMaintenanceMemo(db: Db): void {
  memo.delete(db);
}

const parse = (v: unknown): Maintenance | null => {
  const o = (typeof v === 'string' ? JSON.parse(v) : v) as { until?: unknown; message?: unknown } | null;
  if (!o || typeof o.until !== 'string' || !Number.isFinite(Date.parse(o.until))) return null;
  return { until: new Date(o.until).toISOString(), message: typeof o.message === 'string' && o.message.trim() ? o.message : DEFAULT_MAINTENANCE_MESSAGE };
};

/** The stored setting, whether or not its time has passed (the Admin page shows both). */
export async function storedMaintenance(db: Db): Promise<Maintenance | null> {
  const [r] = await db.query<{ value: unknown }>('SELECT value FROM app_settings WHERE key = $1', [MAINTENANCE_KEY]);
  return r ? parse(r.value) : null;
}

/** On right now: the setting exists and its end time is in the future. Memoised. */
export async function activeMaintenance(db: Db, now = Date.now()): Promise<Maintenance | null> {
  const hit = memo.get(db);
  const value = hit && now - hit.at < MEMO_MS ? hit.value : await storedMaintenance(db);
  if (!hit || now - hit.at >= MEMO_MS) memo.set(db, { at: now, value });
  return value && Date.parse(value.until) > now ? value : null;
}

export async function setMaintenance(db: Db, m: Maintenance | null, by: string): Promise<void> {
  if (m === null) { await db.query('DELETE FROM app_settings WHERE key = $1', [MAINTENANCE_KEY]); return; }
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, ($2::text)::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [MAINTENANCE_KEY, JSON.stringify(m), by]);
}
