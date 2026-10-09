// Database queries for sign-in sessions (M26 F0-01: moved here from auth/, routes/ and pages/).
import type { Db } from '../../db.ts';
import type { Listener } from '../../../auth/session.ts';

/** Sign out one session by its token hash. */
export async function deleteSessionByHash(db: Db, hash: Buffer | string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
}

/** A new session row; `second_factor_at` is now() when the sign-in already proved the inbox. */
export async function insertSession(db: Db, hash: Buffer, listenerId: string, deviceLabel: string | null, country: string | null, extra: { secondFactor?: boolean }): Promise<void> {
  await db.query(`INSERT INTO sessions (token_hash, listener_id, device_label, country, second_factor_at) VALUES ($1, $2, $3, $4, ${extra.secondFactor ? 'now()' : 'NULL'})`, [
    hash, listenerId, deviceLabel, country,
  ]);
}

export async function sessionExistsRows(db: Db, hash: Buffer): Promise<{ ok: number }[]> {
  return db.query<{ ok: number }>('SELECT 1 AS ok FROM sessions WHERE token_hash = $1', [hash]);
}

/** Re-keys a session row from one token hash to another (secret rotation). */
export async function rehashSession(db: Db, cur: Buffer, from: Buffer): Promise<void> {
  await db.query('UPDATE sessions SET token_hash = $1 WHERE token_hash = $2', [cur, from]);
}

/** Swaps the session `old` for `freshHash` when its last swap is `ROTATE_EVERY_HOURS` old; returns `fresh`, or undefined. */
export async function rotateSessionRow(db: Db, old: Buffer, fresh: string, freshHash: Buffer, ROTATE_EVERY_HOURS: number): Promise<string | undefined> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ listener_id: string; device_label: string | null; created_at: Date | string; country: string | null; second_factor_at: Date | string | null }>(
      `UPDATE sessions SET replaced_at = now()
        WHERE token_hash = $1 AND replaced_at IS NULL AND acting_admin_id IS NULL
          AND rotated_at < now() - make_interval(hours => ${ROTATE_EVERY_HOURS})
        RETURNING listener_id, device_label, created_at, country, second_factor_at`,
      [old]);
    if (!row) return undefined;
    await tx.query(
      `INSERT INTO sessions (token_hash, listener_id, device_label, created_at, last_seen_at, country, second_factor_at, rotated_at)
       VALUES ($1, $2, $3, $4, now(), $5, $6, now())`,
      [freshHash, row.listener_id, row.device_label, new Date(row.created_at), row.country, row.second_factor_at === null ? null : new Date(row.second_factor_at)]);
    await tx.query('UPDATE sessions SET replaced_by = $2 WHERE token_hash = $1', [old, freshHash]);
    return fresh;
  });
}

/** The listener behind a live phone session; also bumps `last_seen_at` and records today's app use. */
export async function listenerForTokenRows(db: Db, hash: Buffer, LIVE_SESSION: string, SESSION_IDLE_DAYS: number, LAST_SEEN_EVERY_MINUTES: number): Promise<Listener[]> {
  return db.query<Listener>(
    `WITH s AS (
       SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.device_label
         FROM sessions s JOIN listeners l ON l.id = s.listener_id
        WHERE s.token_hash = $1 AND s.acting_admin_id IS NULL
          AND s.last_seen_at > now() - make_interval(days => $2::int)
          AND ${LIVE_SESSION}
     ), u AS (
       UPDATE sessions SET last_seen_at = now()
        WHERE token_hash = $1 AND EXISTS (SELECT 1 FROM s)
          AND last_seen_at < now() - make_interval(mins => $3::int)
     ), d AS (
       INSERT INTO daily_active (day, listener_id)
       SELECT ((now() AT TIME ZONE 'UTC') + interval '8 hours')::date, id FROM s
        WHERE device_label IS DISTINCT FROM 'studio-web'
       ON CONFLICT DO NOTHING
     )
     SELECT id, email, display_name, created_at, suspended_at FROM s`,
    [hash, SESSION_IDLE_DAYS, LAST_SEEN_EVERY_MINUTES],
  );
}

export type StudioSessionRow = Listener & { last_seen_at: Date | string };

/** The listener behind a live Studio session (label `STUDIO_LABEL`), with its `last_seen_at`. */
export async function studioSessionRows(db: Db, hash: Buffer, STUDIO_LABEL: string, liveSessionSql: string): Promise<StudioSessionRow[]> {
  return db.query<StudioSessionRow>(
    `SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.last_seen_at
       FROM sessions s JOIN listeners l ON l.id = s.listener_id
      WHERE s.token_hash = $1 AND s.device_label = $2 AND s.acting_admin_id IS NULL
        AND ${liveSessionSql}`,
    [hash, STUDIO_LABEL],
  );
}

export async function touchSessionLastSeen(db: Db, hash: Buffer): Promise<void> {
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [hash]);
}

export async function sessionCreatedAtRows(db: Db, hash: Buffer): Promise<{ created_at: Date | string }[]> {
  return db.query<{ created_at: Date | string }>('SELECT created_at FROM sessions WHERE token_hash = $1', [hash]);
}

/** Ends every act-as session an admin owns. */
export async function deleteActAsSessions(db: Db, adminId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE acting_admin_id = $1', [adminId]);
}

export async function insertActAsSession(db: Db, hash: Buffer, targetId: string, deviceLabel: string, adminId: string): Promise<void> {
  await db.query('INSERT INTO sessions (token_hash, listener_id, device_label, acting_admin_id) VALUES ($1, $2, $3, $4)', [hash, targetId, deviceLabel, adminId]);
}

/** The account behind an act-as token owned by `adminId` (still an admin), with the session's creation time. */
export async function actingTargetRows(db: Db, hash: Buffer, deviceLabel: string, adminId: string): Promise<(Listener & { created: Date | string })[]> {
  return db.query<Listener & { created: Date | string }>(
    `SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.created_at AS created
       FROM sessions s JOIN listeners l ON l.id = s.listener_id
      WHERE s.token_hash = $1 AND s.device_label = $2 AND s.acting_admin_id = $3
        AND EXISTS (SELECT 1 FROM admins a WHERE a.listener_id = $3)`,
    [hash, deviceLabel, adminId],
  );
}
