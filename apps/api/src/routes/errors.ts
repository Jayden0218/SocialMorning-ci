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
import { clientAddress, HOUR_MS, limit } from '../auth/rate.ts';
import { recordErrors } from '../db/repos/account/error-reports.ts';

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
