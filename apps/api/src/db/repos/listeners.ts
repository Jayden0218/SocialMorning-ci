import type { Db } from '../db.ts';
import type { Listener } from '../../auth/session.ts';

export type ListenerAuthRow = Listener & { password_hash: string; failed_attempts: number; suspended_at?: Date | string | null; locked_until: Date | string | null };

export async function createListener(db: Db, email: string, passwordHash: string, displayName: string): Promise<Listener | 'exists'> {
  const rows = await db.query<Listener>(
    `INSERT INTO listeners (email, password_hash, display_name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, display_name, created_at`,
    [email, passwordHash, displayName],
  );
  return rows[0] ?? 'exists';
}

export async function listenerByEmail(db: Db, email: string): Promise<ListenerAuthRow | undefined> {
  const rows = await db.query<ListenerAuthRow>(
    'SELECT id, email, display_name, created_at, password_hash, failed_attempts, locked_until, suspended_at FROM listeners WHERE email = $1',
    [email],
  );
  return rows[0];
}

export async function recordFailedSignIn(db: Db, id: string, lockedUntilMs: number | null): Promise<void> {
  await db.query('UPDATE listeners SET failed_attempts = failed_attempts + 1, locked_until = $2 WHERE id = $1', [
    id, lockedUntilMs === null ? null : new Date(lockedUntilMs),
  ]);
}

export async function clearFailedSignIns(db: Db, id: string): Promise<void> {
  await db.query('UPDATE listeners SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [id]);
}
