// My notices from hosts, my monthly report, and the teen-mode passcode reset by email code.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { CODE_TTL_MS, RESEND_AFTER_MS, checkCode, consumeCode, newCode, resendWait, storeCode } from '../../auth/codes.ts';
import { limitCodeRequest } from '../../auth/rate.ts';
import { hostNotices } from '../../db/repos/social/host-notices.ts';
import { monthReport } from '../../db/repos/social/report.ts';

/** M19 US8, US9, US10 — mounted at /v1/me. */
export const m19Me = new Hono<AuthEnv>();

m19Me.get('/host-notices', requireAuth, async (c) => {
  const before = z.string().datetime().optional().safeParse(c.req.query('before'));
  if (!before.success) throw new ApiError('validation', 'before must be an ISO time.', { fields: ['before'] });
  return c.json(await hostNotices(c.get('db'), c.get('listener')!.id, before.data));
});

m19Me.get('/report', requireAuth, async (c) => {
  const r = await monthReport(c.get('db'), c.get('listener')!.id, c.req.query('month') ?? '');
  if (!r) throw new ApiError('validation', 'month must be YYYY-MM.', { fields: ['month'] });
  return c.json(r);
});

/**
 * US9 (FR-061): a forgotten teen-mode passcode. The passcode itself lives only on the phone; the
 * server proves the person holds the account's email, with the same codes as sign-in.
 */
m19Me.post('/teen-reset/start', requireAuth, async (c) => {
  const mailer = c.get('mailer');
  if (!mailer) throw new ApiError('unavailable', 'Email is not set up yet.');
  const to = c.get('listener')!.email;
  const db = c.get('db');
  const now = Date.now();
  const wait = await resendWait(db, to, now);
  if (wait > 0) throw new ApiError('locked', `Wait ${wait} s before asking for another code.`, { retryAfterSeconds: wait });
  // M23 US2 (FR-003): 10 an hour per address, and a daily total below Gmail's quota.
  await limitCodeRequest(db, c);
  const code = newCode();
  await storeCode(db, to, code, c.get('pepper'), now);
  await mailer.send({ to, subject: `${code} turns teen mode off`, text: `Your SocialNet code is ${code}. Enter it in the app to turn teen mode off and clear its passcode.\n\nIt works for ${CODE_TTL_MS / 60_000} minutes. If you did not ask for it, ignore this email.` });
  return c.json({ sent: true, resendAfterSeconds: RESEND_AFTER_MS / 1000 });
});

m19Me.post('/teen-reset/check', requireAuth, json(z.object({ code: z.string().trim().regex(/^\d{6}$/) })), async (c) => {
  const db = c.get('db');
  const email = c.get('listener')!.email;
  const r = await checkCode(db, email, c.req.valid('json').code, c.get('pepper'), Date.now(), c.get('pepperNext'));
  if (r !== 'ok') throw new ApiError('unauthenticated', r === 'expired' ? 'That code has expired. Ask for a new one.' : 'That code is not right.');
  await consumeCode(db, email);
  return c.body(null, 204);
});
