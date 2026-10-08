// Studio routes for the admin second factor: is it needed, send the code, check it (and remember this browser).
/**
 * Studio API (`/v1/studio/*`) — M25 lane SB, the admin second factor (src/auth/second-factor.ts).
 *   GET  /second-factor          → { needed } — false for a non-admin, a passed session or a remembered browser
 *   POST /second-factor/send     → mails a code to the admin's own address (30 s apart, 10 an hour)
 *   POST /second-factor/verify   { code, remember? } → marks this session; `remember` sets the 30-day cookie
 * While acting as someone, the session and the address are the ADMIN's own.
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { tokenHash } from '../../auth/session.ts';
import { isAdmin } from '../../auth/admin.ts';
import { checkSecondFactor, rememberDevice, secondFactorDone, sendSecondFactor } from '../../auth/second-factor.ts';
import { HOUR_MS, limit } from '../../auth/rate.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

/** Codes mailed per admin an hour (each also waits 30 s after the last). */
export const FACTOR_SENDS_PER_HOUR = 10;

export function registerSecondFactor(studio: Hono<StudioEnv>): void {
  const admin = async (c: import('hono').Context<StudioEnv>) => {
    const who = c.get('actingAdmin') ?? c.get('listener')!;
    if (!(await isAdmin(c.get('db'), who.id))) throw new ApiError('not_admin', 'Admin is for the owner only.');
    return { who, hash: tokenHash(c.get('token')!, c.get('pepper')) };
  };

  studio.get('/second-factor', async (c) => {
    const who = c.get('actingAdmin') ?? c.get('listener')!;
    if (!(await isAdmin(c.get('db'), who.id))) return c.json({ needed: false });
    const done = await secondFactorDone(c, c.get('db'), tokenHash(c.get('token')!, c.get('pepper')), who.id, c.get('pepper'), c.get('pepperNext'));
    return c.json({ needed: !done });
  });

  studio.post('/second-factor/send', async (c) => {
    const { who, hash } = await admin(c);
    const db = c.get('db');
    await limit(db, `factor:send:${who.id}`, HOUR_MS, FACTOR_SENDS_PER_HOUR, 'Too many codes this hour. Try again later.');
    const r = await sendSecondFactor(db, c.get('mailer'), hash, who.email, c.get('pepper'));
    return c.json({ sent: true, ...r });
  });

  studio.post('/second-factor/verify', json(z.object({ code: z.string().trim().regex(/^\d{6}$/), remember: z.boolean().optional() })), async (c) => {
    const { who, hash } = await admin(c);
    const b = c.req.valid('json');
    const r = await checkSecondFactor(c.get('db'), hash, b.code, c.get('pepper'), c.get('pepperNext'));
    // 422, not 401: the Studio reads a 401 as "signed out".
    if (r === 'expired') throw new ApiError('validation', 'That code has expired. Ask for a new one.', { fields: ['code'], expired: true });
    if (r === 'wrong') throw new ApiError('validation', 'That code is not right.', { fields: ['code'] });
    if (b.remember) rememberDevice(c, who.id, c.get('pepper'));
    return c.json({ ok: true });
  });
}
