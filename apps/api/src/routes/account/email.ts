// Change the sign-in email: send a code to the new address, check it, switch, tell the old address.
/**
 * M24 US16 (spec 025, lane A3). Mounted at /v1/me/email.
 *  - POST /start   { email }  → { sent: true, resendAfterSeconds } — a 6-digit code goes to the NEW
 *    address with the existing mailer. Refused when another account already uses it (409 conflict)
 *    or it is already yours (422). Limits: one code per 30 s, 5 an hour per account, plus the
 *    sign-in codes' per-network and daily limits (M23).
 *  - POST /confirm { code }   → { email } — 10 minutes, 5 tries (the try is reserved before the
 *    compare, like sign-in codes), compared in constant time. A right code switches the email in
 *    one statement, deletes the pending change, and emails the OLD address that it changed.
 *    Fix F-S: it also signs out every OTHER session of the account (phones, Studio) and answers
 *    { email, signedOut: n }; the session that confirmed stays signed in.
 *
 * Guard G-M24-A3-2: without the right code the email never changes (test/m24-account.test.ts).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth, tokenHash } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { CODE_TTL_MS, MAX_ATTEMPTS, RESEND_AFTER_MS, codeHash, newCode } from '../../auth/codes.ts';
import { HOUR_MS, limit, limitCodeRequest } from '../../auth/rate.ts';

export const EMAIL_CHANGES_PER_HOUR = 5;

const email = z.string().trim().toLowerCase().email().max(254);

/** "someone@example.com" → "s******e@example.com" — the old address is told where the account went, not all of it. */
export const maskEmail = (e: string): string => e.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`);

export const emailChange = new Hono<AuthEnv>();

emailChange.post('/start', requireAuth, json(z.object({ email })), async (c) => {
  const to = c.req.valid('json').email;
  const mailer = c.get('mailer');
  if (!mailer) throw new ApiError('unavailable', 'Email is not set up yet.');
  const db = c.get('db');
  const me = c.get('listener')!;
  if (to === me.email.toLowerCase()) throw new ApiError('validation', 'That is already your sign-in email.', { fields: ['email'] });
  const [taken] = await db.query('SELECT 1 FROM listeners WHERE email = $1 AND id <> $2', [to, me.id]);
  if (taken) throw new ApiError('conflict', 'Another account uses that email.');
  const now = Date.now();
  const [pending] = await db.query<{ sent_at: Date | string }>('SELECT sent_at FROM email_changes WHERE listener_id = $1', [me.id]);
  const wait = pending ? new Date(pending.sent_at).getTime() + RESEND_AFTER_MS - now : 0;
  if (wait > 0) throw new ApiError('locked', `Wait ${Math.ceil(wait / 1000)} s before asking for another code.`, { retryAfterSeconds: Math.ceil(wait / 1000) });
  await limit(db, `email-change:l:${me.id}`, HOUR_MS, EMAIL_CHANGES_PER_HOUR, 'Too many codes were asked for. Try again in an hour.');
  await limitCodeRequest(db, c);
  const code = newCode();
  await db.query(
    `INSERT INTO email_changes (listener_id, new_email, code_hash, sent_at, expires_at, tries) VALUES ($1, $2, $3, $4, $5, 0)
     ON CONFLICT (listener_id) DO UPDATE SET new_email = EXCLUDED.new_email, code_hash = EXCLUDED.code_hash, sent_at = EXCLUDED.sent_at, expires_at = EXCLUDED.expires_at, tries = 0`,
    [me.id, to, codeHash(to, code, c.get('pepper')), new Date(now), new Date(now + CODE_TTL_MS)]);
  await mailer.send({
    to,
    subject: `${code} is your SocialNet code`,
    text: `Use ${code} to make this your SocialNet sign-in email.\n\nIt works for ${CODE_TTL_MS / 60_000} minutes. If you did not ask for it, you can ignore this email.`,
  });
  return c.json({ sent: true, resendAfterSeconds: RESEND_AFTER_MS / 1000 });
});

emailChange.post('/confirm', requireAuth, json(z.object({ code: z.string().trim().regex(/^\d{6}$/) })), async (c) => {
  const { code } = c.req.valid('json');
  const db = c.get('db');
  const me = c.get('listener')!;
  // The try is taken before the compare: parallel guesses cannot all be checked (as in auth/codes.ts).
  const [row] = await db.query<{ new_email: string; code_hash: Buffer | Uint8Array; tries: number }>(
    `UPDATE email_changes SET tries = tries + 1 WHERE listener_id = $1 AND tries < $2 AND expires_at > $3
     RETURNING new_email, code_hash, tries`, [me.id, MAX_ATTEMPTS, new Date()]);
  if (!row) throw new ApiError('validation', 'That code has expired. Ask for a new one.', { fields: ['code'] });
  const want = Buffer.from(row.code_hash);
  const got = codeHash(row.new_email, code, c.get('pepper'));
  if (!(want.length === got.length && timingSafeEqual(want, got))) {
    if (row.tries >= MAX_ATTEMPTS) await db.query('DELETE FROM email_changes WHERE listener_id = $1', [me.id]);
    throw new ApiError('validation', 'That code is not right.', { fields: ['code'] });
  }
  const to = row.new_email.toLowerCase();
  const old = me.email;
  const keep = tokenHash(c.get('token')!, c.get('pepper'));
  const switched = await db.transaction(async (tx) => {
    const [taken] = await tx.query('SELECT 1 FROM listeners WHERE email = $1 AND id <> $2', [to, me.id]);
    if (taken) return false;
    await tx.query('UPDATE listeners SET email = $2 WHERE id = $1', [me.id, to]);
    await tx.query('DELETE FROM email_changes WHERE listener_id = $1', [me.id]);
    // Sign-in codes already sent to either address are void now.
    await tx.query('DELETE FROM email_codes WHERE email = $1 OR email = $2', [old, to]);
    // Fix F-S (guard G-M24-FS-2): every other session of this account is signed out; this one stays.
    const gone = await tx.query('DELETE FROM sessions WHERE listener_id = $1 AND token_hash <> $2 RETURNING 1', [me.id, keep]);
    return { signedOut: gone.length };
  });
  if (switched === false) {
    await db.query('DELETE FROM email_changes WHERE listener_id = $1', [me.id]);
    throw new ApiError('conflict', 'Another account uses that email now.');
  }
  // The switch is done; a failed notice is logged, not reported as a failed change.
  try {
    await c.get('mailer')?.send({
      to: old,
      subject: 'Your SocialNet sign-in email changed',
      text: `Your SocialNet account now signs in with ${maskEmail(to)}.\n\nIf you did not do this, write to us${c.get('safety')?.appealsEmail ? ` at ${c.get('safety')!.appealsEmail}` : ''} right away.`,
    });
  } catch (e) {
    console.error('email change notice failed', e instanceof Error ? e.message : String(e));
  }
  return c.json({ email: to, signedOut: switched.signedOut });
});
