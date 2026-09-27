import { Hono } from 'hono';
import { json } from '../validate.ts';
import { z } from 'zod';
import { lockoutUntil } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { suspendedError, createSession, publicListener, requireAuth, tokenHash } from '../auth/session.ts';
import { COUNTRY_HEADER, recordCountry } from '../db/repos/country.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { clearFailedSignIns, createListener, listenerByEmail, recordFailedSignIn } from '../db/repos/listeners.ts';
import { ApiError } from '../errors.ts';
import { randomBytes } from 'node:crypto';
import { checkCode, consumeCode, newCode, resendWait, storeCode, CODE_TTL_MS, RESEND_AFTER_MS } from '../auth/codes.ts';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8).max(200);

const signUpBody = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(40),
});
const signInBody = z.object({ email, password: z.string().min(1).max(200), deviceLabel: z.string().max(80).optional() });

/** The same 401 for "no such email" and "wrong password" (FR-005, quickstart A14). */
const BAD_CREDENTIALS = () => new ApiError('unauthenticated', 'That email and password do not match.');

export const auth = new Hono<AuthEnv>();

auth.post('/sign-up', json(signUpBody), async (c) => {
  const body = c.req.valid('json');
  const db = c.get('db');
  const created = await createListener(db, body.email, await hashPassword(body.password), body.displayName);
  if (created === 'exists') {
    throw new ApiError('conflict', 'An account with this email exists — sign in instead.');
  }
  const token = await createSession(db, created.id, c.get('pepper'));
  await recordCountry(db, created.id, c.req.header(COUNTRY_HEADER)); // M10b US7
  return c.json({ token, listener: publicListener(created) });
});

auth.post('/sign-in', json(signInBody), async (c) => {
  const body = c.req.valid('json');
  const db = c.get('db');
  const row = await listenerByEmail(db, body.email);
  if (!row) {
    // Burn the same time as a real verify so timing does not reveal the email (R3).
    await verifyPassword(body.password, 'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    throw BAD_CREDENTIALS();
  }
  const now = Date.now();
  const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : null;
  if (lockedUntil !== null && lockedUntil > now) {
    throw new ApiError('locked', 'Too many attempts. Try again shortly.', {
      retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
    });
  }
  if (!(await verifyPassword(body.password, row.password_hash))) {
    await recordFailedSignIn(db, row.id, lockoutUntil(row.failed_attempts + 1, now));
    throw BAD_CREDENTIALS();
  }
  await clearFailedSignIns(db, row.id);
  if (row.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail);
  const token = await createSession(db, row.id, c.get('pepper'), body.deviceLabel);
  await recordCountry(db, row.id, c.req.header(COUNTRY_HEADER)); // M10b US7
  return c.json({ token, listener: publicListener(row) });
});

// ---- Email codes (owner, 2026-09-27): the app signs in and signs up with a code, no password. ----

const codeRequest = z.object({ email });
const codeVerify = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/),
  displayName: z.string().trim().min(1).max(40).optional(),
  deviceLabel: z.string().max(80).optional(),
});

/** Sends a code whether or not an account exists, and answers the same either way (no email enumeration). */
auth.post('/code', json(codeRequest), async (c) => {
  const { email: to } = c.req.valid('json');
  const mailer = c.get('mailer');
  if (!mailer) throw new ApiError('unavailable', 'Email sign-in is not set up yet.');
  const db = c.get('db');
  const now = Date.now();
  const wait = await resendWait(db, to, now);
  if (wait > 0) throw new ApiError('locked', `Wait ${wait} s before asking for another code.`, { retryAfterSeconds: wait });
  const code = newCode();
  await storeCode(db, to, code, c.get('pepper'), now);
  await mailer.send({
    to,
    subject: `${code} is your SocialNet code`,
    text: `Your SocialNet code is ${code}.\n\nIt works for ${CODE_TTL_MS / 60_000} minutes. If you did not ask for it, you can ignore this email.`,
  });
  return c.json({ sent: true, resendAfterSeconds: RESEND_AFTER_MS / 1000 });
});

/**
 * A right code signs in an existing account, or creates one when a name is given.
 * For a new email with no name yet, the answer is `{ needsName: true }` and the code
 * stays valid — only someone holding the code learns that the email is new.
 */
auth.post('/code/verify', json(codeVerify), async (c) => {
  const body = c.req.valid('json');
  const db = c.get('db');
  const pepper = c.get('pepper');
  const result = await checkCode(db, body.email, body.code, pepper, Date.now());
  if (result === 'expired') throw new ApiError('unauthenticated', 'That code has expired. Ask for a new one.');
  if (result === 'wrong') throw new ApiError('unauthenticated', 'That code is not right.');
  let row = await listenerByEmail(db, body.email);
  if (!row) {
    if (!body.displayName) return c.json({ needsName: true });
    // No password is ever asked; the stored hash is of random bytes nobody knows.
    const created = await createListener(db, body.email, await hashPassword(randomBytes(32).toString('hex')), body.displayName);
    if (created === 'exists') throw new ApiError('conflict', 'An account with this email exists — sign in instead.');
    row = await listenerByEmail(db, body.email);
  }
  await consumeCode(db, body.email);
  if (!row) throw new ApiError('not_found', 'No such account.');
  if (row.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail);
  const token = await createSession(db, row.id, pepper, body.deviceLabel);
  await recordCountry(db, row.id, c.req.header(COUNTRY_HEADER)); // M10b US7
  return c.json({ token, listener: publicListener(row) });
});

auth.post('/sign-out', requireAuth, async (c) => {
  await c.get('db').query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(c.get('token')!, c.get('pepper'))]);
  return c.json({});
});
