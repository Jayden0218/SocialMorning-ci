import { Hono } from 'hono';
import { json } from '../validate.ts';
import { z } from 'zod';
import { lockoutUntil } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { suspendedError, createSession, publicListener, requireAuth, tokenHash } from '../auth/session.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { clearFailedSignIns, createListener, listenerByEmail, recordFailedSignIn } from '../db/repos/listeners.ts';
import { ApiError } from '../errors.ts';

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
  return c.json({ token, listener: publicListener(row) });
});

auth.post('/sign-out', requireAuth, async (c) => {
  await c.get('db').query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(c.get('token')!, c.get('pepper'))]);
  return c.json({});
});
