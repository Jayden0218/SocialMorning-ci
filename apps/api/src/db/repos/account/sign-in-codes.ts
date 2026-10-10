// Database queries for email sign-in codes (M26 F0-01: moved here from auth/codes.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type EmailCodeRow = { code_hash: Buffer | Uint8Array; sent_at: Date | string; expires_at: Date | string; attempts: number };

export const codeSentAtRows = dual('ac/index', 'codeSentAtRows', async (db: Db, email: string): Promise<EmailCodeRow[]> => {
  return db.query<EmailCodeRow>('SELECT sent_at FROM email_codes WHERE email = $1', [email]);
});

/** Stores (or replaces) the hashed code for an email, with zero attempts used. */
export const upsertEmailCode = dual('ac/index', 'upsertEmailCode', async (db: Db, email: string, codeHash: Buffer, sentAt: Date, expiresAt: Date): Promise<void> => {
  await db.query(
    `INSERT INTO email_codes (email, code_hash, sent_at, expires_at, attempts) VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, sent_at = EXCLUDED.sent_at, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [email, codeHash, sentAt, expiresAt],
  );
});

/** Reserves one attempt while fewer than `maxAttempts` are used and the code has not expired at `now`. */
export const reserveCodeAttempt = dual('ac/index', 'reserveCodeAttempt', async (db: Db, email: string, maxAttempts: number, now: Date): Promise<EmailCodeRow[]> => {
  return db.query<EmailCodeRow>(
    `UPDATE email_codes SET attempts = attempts + 1
      WHERE email = $1 AND attempts < $2 AND expires_at > $3
      RETURNING code_hash, expires_at, attempts`,
    [email, maxAttempts, now],
  );
});

/** A right code gives its attempt back. */
export const returnCodeAttempt = dual('ac/index', 'returnCodeAttempt', async (db: Db, email: string): Promise<void> => {
  await db.query('UPDATE email_codes SET attempts = attempts - 1 WHERE email = $1 AND attempts > 0', [email]);
});

export const deleteEmailCode = dual('ac/index', 'deleteEmailCode', async (db: Db, email: string): Promise<void> => {
  await db.query('DELETE FROM email_codes WHERE email = $1', [email]);
});
