// Database queries for the admin second factor kept on the session row (M26 F0-01: moved here from auth/second-factor.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type SecondFactorAtRow = { second_factor_at: Date | string | null };

export const secondFactorAtRows = dual('ac/index', 'secondFactorAtRows', async (db: Db, hash: Buffer): Promise<SecondFactorAtRow[]> => {
  return db.query<SecondFactorAtRow>('SELECT second_factor_at FROM sessions WHERE token_hash = $1', [hash]);
});

/** Marks the session as past the second factor. */
export const markSecondFactorDone = dual('ac/index', 'markSecondFactorDone', async (db: Db, hash: Buffer): Promise<void> => {
  await db.query('UPDATE sessions SET second_factor_at = now() WHERE token_hash = $1', [hash]);
});

export const secondFactorSentAtRows = dual('ac/index', 'secondFactorSentAtRows', async (db: Db, hash: Buffer): Promise<{ second_factor_sent_at: Date | string | null }[]> => {
  return db.query<{ second_factor_sent_at: Date | string | null }>('SELECT second_factor_sent_at FROM sessions WHERE token_hash = $1', [hash]);
});

/** Stores a new hashed code on the session and resets its tries. */
export const storeSecondFactorCode = dual('ac/index', 'storeSecondFactorCode', async (db: Db, hash: Buffer, codeHash: Buffer, sentAt: Date): Promise<void> => {
  await db.query('UPDATE sessions SET second_factor_code = $2, second_factor_sent_at = $3, second_factor_tries = 0 WHERE token_hash = $1',
    [hash, codeHash, sentAt]);
});

/** Reserves one try while fewer than `maxTries` are used and the code is newer than `sentAfter`. */
export const reserveSecondFactorTry = dual('ac/index', 'reserveSecondFactorTry', async (db: Db, hash: Buffer, maxTries: number, sentAfter: Date): Promise<{ second_factor_code: Buffer | Uint8Array; second_factor_tries: number }[]> => {
  return db.query<{ second_factor_code: Buffer | Uint8Array; second_factor_tries: number }>(
    `UPDATE sessions SET second_factor_tries = second_factor_tries + 1
      WHERE token_hash = $1 AND second_factor_code IS NOT NULL AND second_factor_tries < $2 AND second_factor_sent_at > $3
      RETURNING second_factor_code, second_factor_tries`,
    [hash, maxTries, sentAfter]);
});

/** A right code: marks the session and clears the code. */
export const passSecondFactor = dual('ac/index', 'passSecondFactor', async (db: Db, hash: Buffer): Promise<void> => {
  await db.query('UPDATE sessions SET second_factor_at = now(), second_factor_code = NULL, second_factor_tries = 0 WHERE token_hash = $1', [hash]);
});

/** Uses the code up. */
export const clearSecondFactorCode = dual('ac/index', 'clearSecondFactorCode', async (db: Db, hash: Buffer): Promise<void> => {
  await db.query('UPDATE sessions SET second_factor_code = NULL WHERE token_hash = $1', [hash]);
});
