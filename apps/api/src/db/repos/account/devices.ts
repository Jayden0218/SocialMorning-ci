// Database queries for the signed-in devices list (M26: moved here from routes/account/devices.ts).
import type { Db } from '../../db.ts';

export type DeviceRow = { id: string; device_label: string | null; country: string | null; created_at: Date | string; last_seen_at: Date | string; current: boolean };

/**
 * The account's live sessions, this one first. `liveSessionSql` is the session-lifetime SQL from
 * auth/session.ts, passed in so this file does not import the auth module.
 */
export async function listDeviceRows(db: Db, listenerId: string, hash: string, idleDays: number, liveSessionSql: string): Promise<DeviceRow[]> {
  return db.query<DeviceRow>(
    `SELECT s.id::text AS id, s.device_label, s.country, s.created_at, s.last_seen_at,
            COALESCE(s.token_hash = $2 OR s.token_hash = (SELECT replaced_by FROM sessions WHERE token_hash = $2), false) AS current
       FROM sessions s
      WHERE s.listener_id = $1 AND s.acting_admin_id IS NULL AND s.replaced_at IS NULL
        AND s.last_seen_at > now() - make_interval(days => $3::int)
        AND ${liveSessionSql}
      ORDER BY 6 DESC, s.last_seen_at DESC
      LIMIT 100`,
    [listenerId, hash, idleDays]);
}

/** One of the account's sessions (not an admin's "act as" one), and whether it is the caller's. */
export async function deviceCurrentRows(db: Db, id: string, listenerId: string, hash: string): Promise<{ current: boolean }[]> {
  return db.query<{ current: boolean }>(
    `SELECT COALESCE(token_hash = $3 OR token_hash = (SELECT replaced_by FROM sessions WHERE token_hash = $3), false) AS current
       FROM sessions WHERE id = $1::uuid AND listener_id = $2 AND acting_admin_id IS NULL`, [id, listenerId, hash]);
}

/** Sign one session out by its public id. */
export async function deleteDevice(db: Db, id: string, listenerId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1::uuid AND listener_id = $2', [id, listenerId]);
}

/** Sign out every other session: keep this token's row, the row that replaced it, and the rows that point at either. */
export async function signOutOtherDevices(db: Db, listenerId: string, hash: string): Promise<{ id: string }[]> {
  return db.query<{ id: string }>(
    `WITH keep AS (
       SELECT token_hash FROM sessions WHERE token_hash = $2
       UNION SELECT replaced_by FROM sessions WHERE token_hash = $2 AND replaced_by IS NOT NULL
     )
     DELETE FROM sessions
      WHERE listener_id = $1 AND acting_admin_id IS NULL
        AND token_hash NOT IN (SELECT token_hash FROM keep)
        AND (replaced_by IS NULL OR replaced_by NOT IN (SELECT token_hash FROM keep))
      RETURNING id::text AS id`,
    [listenerId, hash]);
}
