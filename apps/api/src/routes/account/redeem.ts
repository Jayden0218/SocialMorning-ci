// Redeem a code: POST /v1/me/redeem gives the code's free grant (PLUS days or a paid show) once per account.
/**
 * M24 US15 (spec 025, lane A3). Mounted at /v1/me. Rate-limited with the M23 counters: 10 tries an
 * hour per account and 30 an hour per network address, counted before the code is looked at, so a
 * wrong guess costs the same as a right one. The logic is in `db/repos/account/redeem.ts`.
 *
 *  - 200 { grant: { kind: 'plus', days, until } | { kind: 'show', feedUrl, title } }
 *  - 404 not_found (no such code) · 409 already_claimed (this account used it) ·
 *    409 already_owned (the show is already yours) · 410 cancelled (off, expired, used up) · 429 locked
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { clientAddress, HOUR_MS, limit } from '../../auth/rate.ts';
import { redeemCode } from '../../db/repos/account/redeem.ts';

export const REDEEM_PER_ACCOUNT_HOUR = 10;
export const REDEEM_PER_ADDRESS_HOUR = 30;

export const redeem = new Hono<AuthEnv>();

redeem.post('/redeem', requireAuth, json(z.object({ code: z.string().trim().min(1).max(64) })), async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  await limit(db, `redeem:l:${me}`, HOUR_MS, REDEEM_PER_ACCOUNT_HOUR, 'Too many tries. Try again in an hour.');
  const addr = clientAddress(c);
  if (addr) await limit(db, `redeem:ip:${addr}`, HOUR_MS, REDEEM_PER_ADDRESS_HOUR, 'Too many tries from this network. Try again in an hour.');
  return c.json({ grant: await redeemCode(db, c.req.valid('json').code, me) });
});
