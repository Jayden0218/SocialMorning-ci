// "Download my data": emails the listener a 24-hour link to a JSON file of their own data; one a day.
/**
 * M25 lane SB (audit #19).
 *   POST /v1/me/export               (signed in) → emails a link to the account's address; 1 a day (429 after)
 *   GET  /v1/me/export/download?t=…  → the JSON file (`db/repos/account/data-export.ts`), as an attachment
 *
 * The link carries `<listenerId>.<expiresMs>.<mac>` — an HMAC of the first two parts with the pepper
 * (either pepper during a rotation), valid 24 hours. It goes only to the account's own inbox, so
 * opening it proves the same thing an email-code sign-in does. A link opens at most 5 times a day.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { DAY_MS, limit } from '../../auth/rate.ts';
import { exportData } from '../../db/repos/account/data-export.ts';

export const EXPORT_LINK_HOURS = 24;
export const EXPORTS_PER_DAY = 1;
export const DOWNLOADS_PER_DAY = 5;

const mac = (body: string, pepper: string) => createHmac('sha256', pepper).update(`data-export:${body}`).digest('base64url');
const same = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function exportLinkToken(listenerId: string, pepper: string, now = Date.now()): string {
  const body = `${listenerId}.${now + EXPORT_LINK_HOURS * 3_600_000}`;
  return `${body}.${mac(body, pepper)}`;
}

/** The listener the link names, or undefined when it is malformed, forged or expired. */
export function listenerForExportLink(t: string, pepper: string, next?: string, now = Date.now()): string | undefined {
  const m = /^([0-9a-f-]{36})\.(\d{1,15})\.([A-Za-z0-9_-]{20,64})$/i.exec(t);
  if (!m || Number(m[2]) <= now) return undefined;
  const body = `${m[1]}.${m[2]}`;
  return same(m[3]!, mac(body, pepper)) || (next !== undefined && same(m[3]!, mac(body, next))) ? m[1] : undefined;
}

export const dataExport = new Hono<AuthEnv>();

dataExport.post('/', requireAuth, async (c) => {
  const mailer = c.get('mailer');
  if (!mailer) throw new ApiError('unavailable', 'Email is not set up, so the link cannot be sent.');
  const me = c.get('listener')!;
  const db = c.get('db');
  await limit(db, `export:${me.id}`, DAY_MS, EXPORTS_PER_DAY, 'You asked for your data today already. Try again tomorrow.');
  const link = `${c.get('publicBase')}/v1/me/export/download?t=${encodeURIComponent(exportLinkToken(me.id, c.get('pepper')))}`;
  await mailer.send({
    to: me.email,
    subject: 'Your SocialNet data',
    text: `You asked for a copy of your SocialNet data. Open this link to download it as a JSON file:\n\n${link}\n\nThe link works for ${EXPORT_LINK_HOURS} hours. Anyone with the link can download the file, so do not forward this email. If you did not ask for this, you can ignore it.`,
  });
  return c.json({ sent: true, expiresInHours: EXPORT_LINK_HOURS });
});

dataExport.get('/download', async (c) => {
  c.header('cache-control', 'private, no-store');
  const id = listenerForExportLink(c.req.query('t') ?? '', c.get('pepper'), c.get('pepperNext'));
  if (!id) throw new ApiError('not_found', 'This link is not valid or has expired. Ask for a new one in the app.');
  const db = c.get('db');
  await limit(db, `export:download:${id}`, DAY_MS, DOWNLOADS_PER_DAY, 'This link was opened too many times today.');
  const data = await exportData(db, id);
  if (data['profile'] === null) throw new ApiError('not_found', 'This account no longer exists.');
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="socialnet-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'private, no-store',
    },
  });
});
