// The maintenance switch the admin turns on and off: stored as an app setting, read through a short memo.
/**
 * M24 US4. The `maintenance` setting = `{ until, message }` while on; none = off. It is on
 * only while `until` is in the future, so it ends by itself. Read on every API call through a
 * 10 s in-process memo per database; the admin's change drops the memo in this process at once.
 */
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';

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

/** The stored value → the setting, or null when it is not a valid one (also used by the DynamoDB body). */
export const parseMaintenance = (v: unknown): Maintenance | null => parse(v);

/** On right now: the setting exists and its end time is in the future. Memoised. */
export async function activeMaintenance(db: Db, now = Date.now()): Promise<Maintenance | null> {
  const hit = memo.get(db);
  const value = hit && now - hit.at < MEMO_MS ? hit.value : await storedMaintenance(db);
  if (!hit || now - hit.at >= MEMO_MS) memo.set(db, { at: now, value });
  return value && Date.parse(value.until) > now ? value : null;
}

export const storedMaintenance = viaStore<typeof import('./ddb/maintenance.ts').storedMaintenance>('sf/maintenance', 'storedMaintenance');
export const setMaintenance = viaStore<typeof import('./ddb/maintenance.ts').setMaintenance>('sf/maintenance', 'setMaintenance');
