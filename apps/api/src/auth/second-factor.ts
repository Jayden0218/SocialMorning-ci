// The admin second factor: an emailed code per session, and a signed cookie that remembers a device for 30 days.
/**
 * M25 lane SB (audit #28). Admin (Studio › Admin and the `/mod` pages) gave everything to whoever
 * had the owner's password. Now a session that wants Admin must also prove the owner's inbox:
 *
 *  - a six-digit code, mailed to the account's address, kept hashed ON the session it unlocks
 *    (`sessions.second_factor_code`): 10 minutes, 5 tries (reserved before the compare, like
 *    `checkCode`), a new one at most every 30 s. A right code sets `second_factor_at`.
 *  - "Remember this device": a cookie `sm_device` = `<listenerId>.<expiresMs>.<mac>`, an HMAC of the
 *    first two parts with the pepper (either pepper while one is being rotated). It is valid for
 *    REMEMBER_DAYS for that account only, and lets a NEW session on the same browser skip the code.
 *  - A session made by an email-code sign-in has already proved the inbox: it is marked at creation.
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/db.ts';
import type { Mailer } from '../mail/mailer.ts';
import { ApiError } from '../errors.ts';
import { clearSecondFactorCode, markSecondFactorDone, passSecondFactor, reserveSecondFactorTry, secondFactorAtRows, secondFactorSentAtRows, storeSecondFactorCode } from '../db/repos/account/second-factor.ts';

export const DEVICE_COOKIE = 'sm_device';
export const REMEMBER_DAYS = 30;
export const FACTOR_TTL_MS = 10 * 60_000;
export const FACTOR_RESEND_MS = 30_000;
export const FACTOR_MAX_TRIES = 5;

const same = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const mac = (body: string, pepper: string): string => createHmac('sha256', pepper).update(`admin-device:${body}`).digest('base64url');
const codeHash = (hash: Buffer, code: string, pepper: string): Buffer =>
  createHash('sha256').update(hash).update('|second-factor|').update(code).update('|').update(pepper).digest();

/** The remembered-device cookie's value for this account, signed with the CURRENT pepper. */
export function deviceToken(listenerId: string, pepper: string, now = Date.now()): string {
  const body = `${listenerId}.${now + REMEMBER_DAYS * 86_400_000}`;
  return `${body}.${mac(body, pepper)}`;
}

/** True when the cookie names this account, is unexpired, and is signed with either pepper. */
export function deviceRemembered(value: string | undefined, listenerId: string, pepper: string, next?: string, now = Date.now()): boolean {
  const m = /^([0-9a-f-]{36})\.(\d{1,15})\.([A-Za-z0-9_-]{20,64})$/i.exec(value ?? '');
  if (!m || m[1] !== listenerId || Number(m[2]) <= now) return false;
  const body = `${m[1]}.${m[2]}`;
  return same(m[3]!, mac(body, pepper)) || (next !== undefined && same(m[3]!, mac(body, next)));
}

export function rememberDevice(c: Context, listenerId: string, pepper: string): void {
  setCookie(c, DEVICE_COOKIE, deviceToken(listenerId, pepper), {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: REMEMBER_DAYS * 86_400,
  });
}

/**
 * Has this session passed the second factor? A remembered device counts (and marks the session,
 * so the cookie is read once per session, not on every call).
 */
export async function secondFactorDone(c: Context, db: Db, hash: Buffer, listenerId: string, pepper: string, next?: string): Promise<boolean> {
  const [row] = await secondFactorAtRows(db, hash);
  if (!row) return false;
  if (row.second_factor_at !== null) return true;
  if (!deviceRemembered(getCookie(c, DEVICE_COOKIE), listenerId, pepper, next)) return false;
  await markSecondFactorDone(db, hash);
  return true;
}

/** Mails a new code for this session. 429 `locked` inside the 30 s resend wait; 503 with no mailer. */
export async function sendSecondFactor(db: Db, mailer: Mailer | undefined, hash: Buffer, email: string, pepper: string, now = Date.now()): Promise<{ resendAfterSeconds: number }> {
  if (!mailer) throw new ApiError('unavailable', 'Email is not set up, so the admin code cannot be sent.');
  const [row] = await secondFactorSentAtRows(db, hash);
  if (!row) throw new ApiError('unauthenticated', 'Sign in again.');
  const sent = row.second_factor_sent_at ? new Date(row.second_factor_sent_at).getTime() : 0;
  if (sent + FACTOR_RESEND_MS > now) {
    const wait = Math.ceil((sent + FACTOR_RESEND_MS - now) / 1000);
    throw new ApiError('locked', `Wait ${wait} s before asking for another code.`, { retryAfterSeconds: wait });
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await storeSecondFactorCode(db, hash, codeHash(hash, code, pepper), new Date(now));
  await mailer.send({
    to: email,
    subject: `${code} is your SocialNet admin code`,
    text: `Your SocialNet admin code is ${code}.\n\nSomeone (we hope you) signed in to SocialNet Admin with your password. The code works for ${FACTOR_TTL_MS / 60_000} minutes. If this was not you, change nothing — just do not share the code, and change your password.`,
  });
  return { resendAfterSeconds: FACTOR_RESEND_MS / 1000 };
}

/**
 * 'ok' marks the session. A try is reserved before the compare (at most 5, however many arrive at
 * once); the 5th wrong one uses the code up. Codes made with either pepper are accepted.
 */
export async function checkSecondFactor(db: Db, hash: Buffer, code: string, pepper: string, next?: string, now = Date.now()): Promise<'ok' | 'wrong' | 'expired'> {
  if (!/^\d{6}$/.test(code)) return 'wrong';
  const [row] = await reserveSecondFactorTry(db, hash, FACTOR_MAX_TRIES, new Date(now - FACTOR_TTL_MS));
  if (!row) return 'expired';
  const want = Buffer.from(row.second_factor_code);
  const match = (p: string) => { const got = codeHash(hash, code, p); return got.length === want.length && timingSafeEqual(got, want); };
  if (match(pepper) || (next !== undefined && match(next))) {
    await passSecondFactor(db, hash);
    return 'ok';
  }
  if (Number(row.second_factor_tries) >= FACTOR_MAX_TRIES) await clearSecondFactorCode(db, hash);
  return 'wrong';
}
