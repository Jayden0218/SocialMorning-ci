// Error log route: the phone sends its recent errors in small batches, signed in or not.
/**
 * M23 US8 (FR-013). POST /v1/errors { reports: [{ scope, message, stack?, appVersion?, platform? }] }
 * (`errors` is accepted as the list's name too, and `version` for `appVersion`).
 *  - at most 20 reports a batch; a stack is cut to 2 KB, a message to 500 characters;
 *  - signed in or not (optionalAuth): the listener id is kept when there is one, nothing else;
 *  - 60 batches an hour per address (`x-forwarded-for`), 5 000 an hour for the whole server.
 * Answers 202 { kept }. The body limit for this path is 96 KB (app.ts).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { clientAddress, hit, HOUR_MS, limit } from '../auth/rate.ts';
import { recordErrors, recordServerError } from '../db/repos/account/error-reports.ts';
import { listenerEmailRows } from '../db/repos/account/profile.ts';
import type { Db } from '../db/db.ts';
import type { Mailer } from '../mail/mailer.ts';

/**
 * M25 S11: what an error's text may say about a person is removed before it is kept — email
 * addresses, bearer tokens, long token-like strings, URL queries and runs of 6+ digits (codes).
 */
export function scrubError(s: string): string {
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/Bearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(/(https?:\/\/[^\s?#'"]+)\?[^\s'"]*/gi, '$1?<query>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<token>')
    .replace(/\d{6,}/g, '<n>');
}

/** One alert email an hour at most, whatever happens. */
export const ALERTS_PER_HOUR = 1;

/**
 * M25 S11 (guard G-M25-S11): an unhandled server error goes into our own error log (scope
 * 'server', no listener, no request body, text scrubbed). The first time a signature is seen, the
 * owner gets one email through the existing mailer — at most one an hour. Never throws: a broken
 * log must not turn a 500 into a crash.
 */
export async function reportServerError(db: Db, err: unknown, where: { method: string; route: string }, alert: { mailer?: Mailer; ownerListenerId?: string }): Promise<void> {
  try {
    const name = err instanceof Error ? err.name : 'Error';
    const text = err instanceof Error ? err.message : String(err);
    const message = scrubError(`${where.method} ${where.route}: ${name}: ${text}`);
    const stack = err instanceof Error && err.stack ? scrubError(err.stack) : undefined;
    const fresh = await recordServerError(db, { message, ...(stack ? { stack } : {}) });
    if (!fresh || !alert.mailer) return;
    const to = process.env['ALERT_EMAIL'] || (alert.ownerListenerId
      ? (await listenerEmailRows(db, alert.ownerListenerId))[0]?.email
      : undefined);
    if (!to) return;
    if (!(await hit(db, 'alert:server-error', HOUR_MS, ALERTS_PER_HOUR)).ok) return;
    await alert.mailer.send({
      to,
      subject: 'SocialNet: a new server error',
      text: `A server error was seen for the first time:\n\n${message}\n\nEvery server error is listed on /mod/errors (scope "server"). At most one of these emails is sent an hour.`,
    });
  } catch (e) {
    console.error('[errors] could not record a server error', e instanceof Error ? e.message : String(e));
  }
}

export const ERRORS_PER_BATCH = 20;
export const BATCHES_PER_ADDRESS_HOUR = 60;
export const BATCHES_PER_HOUR = 5000;

const report = z.object({
  scope: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  appVersion: z.string().max(40).optional(),
  version: z.string().max(40).optional(),
  platform: z.string().max(20).optional(),
});
const batch = z.object({
  reports: z.array(report).max(ERRORS_PER_BATCH).optional(),
  errors: z.array(report).max(ERRORS_PER_BATCH).optional(),
});

export const errorsRoute = new Hono<AuthEnv>();

errorsRoute.post('/', optionalAuth, async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = undefined; }
  const parsed = batch.safeParse(raw);
  if (!parsed.success) throw new ApiError('validation', `Send { reports: [{ scope, message, stack?, appVersion?, platform? }] }, at most ${ERRORS_PER_BATCH}.`, { fields: ['reports'] });
  const list = parsed.data.reports ?? parsed.data.errors ?? [];
  const db = c.get('db');
  const addr = clientAddress(c);
  if (addr) await limit(db, `errors:ip:${addr}`, HOUR_MS, BATCHES_PER_ADDRESS_HOUR, 'Too many error reports from this network. Try again later.');
  await limit(db, 'errors:global', HOUR_MS, BATCHES_PER_HOUR, 'Too many error reports right now. Try again later.');
  const kept = await recordErrors(db, c.get('listener')?.id ?? null, list.map((r) => ({
    scope: r.scope, message: r.message,
    ...(r.stack ? { stack: r.stack } : {}),
    ...(r.appVersion ?? r.version ? { appVersion: (r.appVersion ?? r.version)! } : {}),
    ...(r.platform ? { platform: r.platform } : {}),
  })));
  return c.json({ kept }, 202);
});
