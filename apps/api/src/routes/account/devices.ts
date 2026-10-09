// Signed-in devices: list this account's sessions, sign one out, or sign out every other one.
/**
 * M25 lane SB (audit #27). `GET /v1/me/sessions` lists the account's live sessions — the phone's,
 * the Studio's and the moderation page's — with a label, where it signed in from (the two-letter
 * country of the network, nothing finer), when it was last used, and which one is this phone.
 * `DELETE /v1/me/sessions/:id` signs one out (its row is deleted, so its token is refused at once,
 * guard G-SB1); `POST /v1/me/sessions/sign-out-others` keeps only this one.
 *
 * A session is identified by its public `id` (the token hash never leaves the server). An admin's
 * "act as" session and a rotated-out token in its grace window are not listed.
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { liveSessionSql, requireAuth, SESSION_IDLE_DAYS, tokenHash } from '../../auth/session.ts';
import { STUDIO_LABEL } from '../../auth/studio-session.ts';
import { ApiError } from '../../errors.ts';
import { deleteDevice, deviceCurrentRows, listDeviceRows, signOutOtherDevices, type DeviceRow } from '../../db/repos/account/devices.ts';

export const devices = new Hono<AuthEnv>();

export type Device = { id: string; kind: 'phone' | 'studio' | 'mod'; label: string; country: string | null; signedInAt: string; lastSeenAt: string; current: boolean };

/** What the list calls a session: the phone's own label, or the web page it belongs to. */
export function deviceOf(label: string | null): { kind: Device['kind']; label: string } {
  if (label === STUDIO_LABEL) return { kind: 'studio', label: 'Studio (web browser)' };
  if (label === 'mod-web') return { kind: 'mod', label: 'Moderation page (web browser)' };
  const l = (label ?? '').trim();
  return { kind: 'phone', label: l.length > 0 ? l.slice(0, 80) : 'Phone' };
}

devices.use('*', async (c, next) => {
  await next();
  c.header('cache-control', 'private, no-store');
});

devices.get('/', requireAuth, async (c) => {
  const me = c.get('listener')!;
  const hash = tokenHash(c.get('token')!, c.get('pepper'));
  // `current`: this token's row — or, when this token was just rotated out, the row that replaced it
  // (COALESCE: a NULL from the sub-select would sort first under DESC).
  const rows: DeviceRow[] = await listDeviceRows(c.get('db'), me.id, hash, SESSION_IDLE_DAYS, liveSessionSql);
  const items: Device[] = rows.map((r) => ({
    id: r.id, ...deviceOf(r.device_label), country: r.country?.trim() || null,
    signedInAt: new Date(r.created_at).toISOString(), lastSeenAt: new Date(r.last_seen_at).toISOString(), current: Boolean(r.current),
  }));
  return c.json({ items });
});

devices.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such device.');
  const db = c.get('db');
  const me = c.get('listener')!;
  const hash = tokenHash(c.get('token')!, c.get('pepper'));
  const [row] = await deviceCurrentRows(db, id, me.id, hash);
  if (!row) throw new ApiError('not_found', 'No such device.');
  if (row.current) throw new ApiError('validation', 'This is the phone you are using. Sign out from Settings instead.', { fields: ['id'] });
  // Its predecessor (a rotated-out token in its grace window) goes with it: ON DELETE CASCADE.
  await deleteDevice(db, id, me.id);
  return c.body(null, 204);
});

devices.post('/sign-out-others', requireAuth, async (c) => {
  const me = c.get('listener')!;
  const hash = tokenHash(c.get('token')!, c.get('pepper'));
  const db = c.get('db');
  // Keep this token's row, the row that replaced it, and the rows that point at either.
  const gone = await signOutOtherDevices(db, me.id, hash);
  return c.json({ signedOut: gone.length });
});
