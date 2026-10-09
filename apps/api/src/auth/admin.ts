// Admin access: who is admin, the admin-only wall, and the admin action record.
/**
 * M15 — who may use Admin, and the record of what they did (specs/015-m15-admin/research.md R1, R2, R6).
 *
 *  - `admins` holds the admins. The owner (`OWNER_LISTENER_ID`) is inserted when the table is
 *    empty, on the first request that asks (FR-002) — `seedOwnerAdmin`.
 *  - `adminOnly` guards every `/v1/admin/*` route: a live Studio session (cookie `sm_studio` or a
 *    `studio-web` Bearer) → the listener is in `admins` → the session was CREATED < 12 h ago
 *    (not just used — a stolen session dies at 12 h even if busy). 401 `signed_out` | `reauth`,
 *    403 `not_admin`. Every answer is `private, no-store`; writes need `X-Studio: 1`.
 *  - `adminWrite` is the only way an admin route changes anything: it reads `before`, writes,
 *    reads `after` and inserts ONE `admin_audit` row, in one transaction (guard G-A2).
 *  - "Act as" (T028): a second `studio-web` session for the account, with `acting_admin_id`,
 *    in cookie `sm_studio_as`. The Studio uses it only beside the same admin's live `sm_studio`.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { issueToken, suspendedError, tokenHash, type AuthEnv, type Listener } from './session.ts';
import { STUDIO_IDLE_MS, STUDIO_LABEL, studioListener, studioToken } from './studio-session.ts';
import { ApiError } from '../errors.ts';
import type { Db } from '../db/db.ts';
import { secondFactorDone } from './second-factor.ts';
import { countAdminsRows, insertOwnerAdmin, isAdminRows } from '../db/repos/admin/admin-access.ts';
import { actingTargetRows, deleteActAsSessions, deleteSessionByHash, insertActAsSession, sessionCreatedAtRows } from '../db/repos/account/sessions.ts';

export const ADMIN_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const ACT_AS_COOKIE = 'sm_studio_as';

export type AdminEnv = { Variables: AuthEnv['Variables'] & { device?: string } };

// M24 lane A1: 'safety' (blocked words, maintenance), 'notices', 'appeals' (migration 023 widens the CHECK).
// M25 lane AC: 'config' (app settings), 'content' (Academy, Help) — migration 029.
export const AUDIT_AREAS = ['picks', 'issues', 'collections', 'discover', 'launch', 'accounts', 'users', 'reports', 'safety', 'notices', 'appeals', 'config', 'content'] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

// jsonb/asObject (jsonb goes in as TEXT, guard G-A4), insertAudit and adminWrite (G-A2) live with their SQL.
export { adminWrite, asObject, insertAudit, jsonb } from '../db/repos/admin/admin-access.ts';

/** M15 T003: the owner becomes the first admin when there is none. Idempotent; a missing listener row is skipped. */
export async function seedOwnerAdmin(db: Db, ownerId: string | undefined): Promise<void> {
  if (!ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) return;
  await insertOwnerAdmin(db, ownerId);
}

/** Seeds once per database per process (a test process builds many apps over one db). */
const seeded = new WeakMap<Db, Set<string>>();
export async function ensureSeeded(db: Db, ownerId: string | undefined): Promise<void> {
  if (!ownerId) return;
  const done = seeded.get(db) ?? new Set<string>();
  if (done.has(ownerId)) return;
  await seedOwnerAdmin(db, ownerId);
  const [any] = await countAdminsRows(db);
  if (Number(any?.n ?? 0) > 0) { done.add(ownerId); seeded.set(db, done); }
}

export async function isAdmin(db: Db, listenerId: string): Promise<boolean> {
  const [r] = await isAdminRows(db, listenerId);
  return Boolean(r?.ok);
}

export const adminOnly: MiddlewareHandler<AdminEnv> = async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const m = c.req.method;
  if (m !== 'GET' && m !== 'HEAD' && c.req.header('x-studio') !== '1') throw new ApiError('csrf', 'This request did not come from the Studio.');
  const db = c.get('db');
  await ensureSeeded(db, c.get('safety').ownerListenerId);
  const token = studioToken(c);
  const who = token ? await studioListener(db, c.get('pepper'), token, c.get('pepperNext')) : undefined;
  if (who === 'expired') throw new ApiError('reauth', 'Sign in again to use Admin.');
  if (!who || !token) throw new ApiError('signed_out', 'Sign in to the Studio.');
  if (who.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail);
  if (!(await isAdmin(db, who.id))) throw new ApiError('not_admin', 'Admin is for the owner only.');
  // G-A5: age since the session was CREATED, not since it was last used.
  const hash = tokenHash(token, c.get('pepper'));
  const [s] = await sessionCreatedAtRows(db, hash);
  if (!s || Date.now() - new Date(s.created_at).getTime() > ADMIN_MAX_AGE_MS) throw new ApiError('reauth', 'Sign in again to use Admin.');
  // M25 SB (guard G-SB2): the emailed second factor, once per session (or per remembered device).
  if (!(await secondFactorDone(c, db, hash, who.id, c.get('pepper'), c.get('pepperNext')))) {
    throw new ApiError('second_factor', 'Enter the code we email you to use Admin.');
  }
  c.set('listener', who);
  c.set('token', token);
  c.set('device', (c.req.header('user-agent') ?? '').slice(0, 200) || undefined);
  await next();
  c.res.headers.set('Cache-Control', 'private, no-store');
};

export type AuditCtx = { adminId: string; actingAs?: string | null; device?: string | null };
export type AuditMeta = { area: AuditArea; action: string; target: string };

// Any route's context: their path and input types differ.
export const auditCtx = (c: Context<AdminEnv, any, any>): AuditCtx => ({ adminId: c.get('listener')!.id, device: c.get('device') ?? null });

// ---- Act as (T028) ----

/** A `studio-web` session for `targetId`, owned by the admin. One at a time per admin. */
export async function startActing(db: Db, pepper: string, adminId: string, targetId: string): Promise<string> {
  const token = issueToken();
  await deleteActAsSessions(db, adminId);
  await insertActAsSession(db, tokenHash(token, pepper), targetId, STUDIO_LABEL, adminId);
  return token;
}

export async function stopActing(db: Db, adminId: string): Promise<void> {
  await deleteActAsSessions(db, adminId);
}

/**
 * The account an admin is acting as — only when the act-as token belongs to THIS admin, was made
 * < 12 h ago, and the admin is still an admin. A suspended account is allowed (to fix it).
 */
export async function actingTarget(db: Db, pepper: string, asToken: string, adminId: string): Promise<Listener | undefined> {
  const [row] = await actingTargetRows(db, tokenHash(asToken, pepper), STUDIO_LABEL, adminId);
  if (!row) return undefined;
  if (Date.now() - new Date(row.created).getTime() > STUDIO_IDLE_MS) {
    await deleteSessionByHash(db, tokenHash(asToken, pepper));
    return undefined;
  }
  const { created: _created, ...listener } = row;
  return listener;
}

export const actAsCookie = (c: Context): string | undefined => getCookie(c, ACT_AS_COOKIE);
