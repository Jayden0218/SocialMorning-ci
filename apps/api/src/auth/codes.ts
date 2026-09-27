/**
 * Email sign-in codes (owner, 2026-09-27). Six digits, 10 minutes, 5 tries, and a new
 * code at most every 30 s per email. Only `sha256(email | code | pepper)` is stored.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/db.ts';

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_AFTER_MS = 30_000;
export const MAX_ATTEMPTS = 5;

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function codeHash(email: string, code: string, pepper: string): Buffer {
  return createHash('sha256').update(email.toLowerCase()).update('|').update(code).update('|').update(pepper).digest();
}

type Row = { code_hash: Buffer | Uint8Array; sent_at: Date | string; expires_at: Date | string; attempts: number };

/** Seconds until another code may be sent to this email; 0 when it may be sent now. */
export async function resendWait(db: Db, email: string, now: number): Promise<number> {
  const [row] = await db.query<Row>('SELECT sent_at FROM email_codes WHERE email = $1', [email]);
  if (!row) return 0;
  const wait = new Date(row.sent_at).getTime() + RESEND_AFTER_MS - now;
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export async function storeCode(db: Db, email: string, code: string, pepper: string, now: number): Promise<void> {
  await db.query(
    `INSERT INTO email_codes (email, code_hash, sent_at, expires_at, attempts) VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, sent_at = EXCLUDED.sent_at, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [email, codeHash(email, code, pepper), new Date(now), new Date(now + CODE_TTL_MS)],
  );
}

/**
 * 'ok' leaves the row in place — the caller decides whether the code is used up
 * (`consumeCode`), because a new account still needs a name after a right code.
 */
export async function checkCode(db: Db, email: string, code: string, pepper: string, now: number): Promise<'ok' | 'wrong' | 'expired'> {
  const [row] = await db.query<Row>('SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = $1', [email]);
  if (!row || new Date(row.expires_at).getTime() <= now || row.attempts >= MAX_ATTEMPTS) return 'expired';
  const want = Buffer.from(row.code_hash);
  const got = codeHash(email, code, pepper);
  if (want.length === got.length && timingSafeEqual(want, got)) return 'ok';
  const [after] = await db.query<{ attempts: number }>('UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING attempts', [email]);
  if (after && after.attempts >= MAX_ATTEMPTS) await consumeCode(db, email);
  return 'wrong';
}

export async function consumeCode(db: Db, email: string): Promise<void> {
  await db.query('DELETE FROM email_codes WHERE email = $1', [email]);
}
