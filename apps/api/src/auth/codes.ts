// Email sign-in codes: six digits, ten minutes, five tries, stored only hashed.
/**
 * Email sign-in codes (owner, 2026-09-27). Six digits, 10 minutes, 5 tries, and a new
 * code at most every 30 s per email. Only `sha256(email | code | pepper)` is stored.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/db.ts';
import { codeSentAtRows, deleteEmailCode, reserveCodeAttempt, returnCodeAttempt, upsertEmailCode } from '../db/repos/account/sign-in-codes.ts';

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_AFTER_MS = 30_000;
export const MAX_ATTEMPTS = 5;

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function codeHash(email: string, code: string, pepper: string): Buffer {
  return createHash('sha256').update(email.toLowerCase()).update('|').update(code).update('|').update(pepper).digest();
}

/** Seconds until another code may be sent to this email; 0 when it may be sent now. */
export async function resendWait(db: Db, email: string, now: number): Promise<number> {
  const [row] = await codeSentAtRows(db, email);
  if (!row) return 0;
  const wait = new Date(row.sent_at).getTime() + RESEND_AFTER_MS - now;
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export async function storeCode(db: Db, email: string, code: string, pepper: string, now: number): Promise<void> {
  await upsertEmailCode(db, email, codeHash(email, code, pepper), new Date(now), new Date(now + CODE_TTL_MS));
}

/**
 * 'ok' leaves the row in place — the caller decides whether the code is used up
 * (`consumeCode`), because a new account still needs a name after a right code.
 *
 * M23 US2 (FR-002, G-M23-2): the attempt is reserved BEFORE the comparison, in one statement
 * that only succeeds while fewer than 5 are used. Fifty guesses arriving at once used to read
 * `attempts = 0` together and all get compared; now at most 5 are, and the 5th wrong one uses
 * the code up. A right code gives its attempt back, so the name step can check it again.
 */
export async function checkCode(db: Db, email: string, code: string, pepper: string, now: number, /** M25 SB: the second pepper during a rotation */ pepperNext?: string): Promise<'ok' | 'wrong' | 'expired'> {
  const [row] = await reserveCodeAttempt(db, email, MAX_ATTEMPTS, new Date(now));
  if (!row) return 'expired';
  const want = Buffer.from(row.code_hash);
  const matches = (p: string) => { const got = codeHash(email, code, p); return want.length === got.length && timingSafeEqual(want, got); };
  if (matches(pepper) || (pepperNext !== undefined && matches(pepperNext))) {
    await returnCodeAttempt(db, email);
    return 'ok';
  }
  if (row.attempts >= MAX_ATTEMPTS) await consumeCode(db, email);
  return 'wrong';
}

export async function consumeCode(db: Db, email: string): Promise<void> {
  await deleteEmailCode(db, email);
}
