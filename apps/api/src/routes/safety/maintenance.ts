// While the admin's maintenance switch is on, every API call answers 503 with the body the phone reads.
/**
 * M24 US4. The body is `{ error: 'maintenance', message, maintenance: { until, message } }` — what
 * the phone's `isMaintenanceBody` and `maintenanceFromBody` already read (apps/mobile/src/social/api.ts,
 * src/ui/shell/startupExtras.ts), so a call mid-session opens the maintenance page.
 *
 * Not refused: anything outside `/v1` (pages, feeds, covers), `/v1/health` (it carries the same
 * news), `/v1/admin/*` (to turn it off again), signing in and the Studio session (to reach Admin) and
 * `/v1/internal/*` (the hourly jobs, e.g. deleting expired voice posts, must keep running).
 */
import type { MiddlewareHandler } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { activeMaintenance } from '../../db/repos/safety/maintenance.ts';

const EXEMPT = /^\/v1\/(health|meta|admin(\/|$)|internal(\/|$)|studio\/(session|me)(\/|$)|auth\/(sign-in|code)(\/|$))/;

export function maintenanceExempt(path: string): boolean {
  return !path.startsWith('/v1/') || EXEMPT.test(path);
}

export const maintenanceGate: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (maintenanceExempt(c.req.path)) return next();
  // A read that fails (e.g. migration 023 not applied yet) is "off": the switch never takes the API down by itself.
  const m = await activeMaintenance(c.get('db')).catch((e: unknown) => { console.warn('[maintenance] read failed', e instanceof Error ? e.message : e); return null; });
  if (!m) return next();
  c.header('cache-control', 'no-store');
  c.header('retry-after', String(Math.max(60, Math.ceil((Date.parse(m.until) - Date.now()) / 1000))));
  return c.json({ error: 'maintenance', message: m.message, maintenance: { until: m.until, message: m.message } }, 503);
};
