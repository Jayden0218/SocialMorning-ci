// Database queries to create and find listener accounts.
import { lockoutUntil } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import type { Listener } from '../../../auth/session.ts';
import { dual } from '../../backend.ts';

export type ListenerAuthRow = Listener & { password_hash: string; failed_attempts: number; suspended_at?: Date | string | null; locked_until: Date | string | null };

export const createListener = dual('ac/index', 'createListener', async (db: Db, email: string, passwordHash: string, displayName: string): Promise<Listener | 'exists'> => {
  const rows = await db.query<Listener>(
    `INSERT INTO listeners (email, password_hash, display_name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, display_name, created_at`,
    [email, passwordHash, displayName],
  );
  return rows[0] ?? 'exists';
});

export const listenerByEmail = dual('ac/index', 'listenerByEmail', async (db: Db, email: string): Promise<ListenerAuthRow | undefined> => {
  const rows = await db.query<ListenerAuthRow>(
    'SELECT id, email, display_name, created_at, password_hash, failed_attempts, locked_until, suspended_at FROM listeners WHERE email = $1',
    [email],
  );
  return rows[0];
});

/**
 * M23 US2 (FR-002): the count comes from the database, not from the row read before the slow
 * password check — wrong passwords arriving in parallel are each counted, and a later, shorter
 * lock never replaces a longer one. Returns the new count.
 */
export const recordFailedSignIn = dual('ac/index', 'recordFailedSignIn', async (db: Db, id: string, now: number): Promise<number> => {
  const [row] = await db.query<{ failed_attempts: number }>(
    'UPDATE listeners SET failed_attempts = failed_attempts + 1 WHERE id = $1 RETURNING failed_attempts', [id],
  );
  const count = row?.failed_attempts ?? 0;
  const until = lockoutUntil(count, now);
  if (until !== null) {
    await db.query('UPDATE listeners SET locked_until = GREATEST(COALESCE(locked_until, $2), $2) WHERE id = $1', [id, new Date(until)]);
  }
  return count;
});

export const clearFailedSignIns = dual('ac/index', 'clearFailedSignIns', async (db: Db, id: string): Promise<void> => {
  await db.query('UPDATE listeners SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [id]);
});
