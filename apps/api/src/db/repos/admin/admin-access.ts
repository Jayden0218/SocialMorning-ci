// Database queries for admin access: who is admin, and the admin action record (M26 F0-01: moved here from auth/admin.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import type { AuditCtx, AuditMeta } from '../../../auth/admin.ts';

/**
 * jsonb goes in as TEXT, cast in SQL: `($n::text)::jsonb` (M14 T-012 lesson — the `postgres` driver
 * double-encodes a string cast straight to jsonb; pglite does not). `null` stays SQL NULL.
 * `asObject` makes sure what is stored is an object (guard G-A4; the column CHECKs it too).
 */
export const jsonb = (v: Record<string, unknown> | null): string | null => (v === null ? null : JSON.stringify(v));
export function asObject(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return { items: v };
  if (typeof v === 'object') return v as Record<string, unknown>;
  return { value: v };
}

/** The owner becomes the first admin when there is none; a missing listener row is skipped. */
async function insertOwnerAdminPg(db: Db, ownerId: string): Promise<void> {
  await db.query(
    `INSERT INTO admins (listener_id, granted_by)
       SELECT $1::uuid, NULL WHERE NOT EXISTS (SELECT 1 FROM admins) AND EXISTS (SELECT 1 FROM listeners WHERE id = $1::uuid)
     ON CONFLICT (listener_id) DO NOTHING`,
    [ownerId],
  );
}

async function countAdminsRowsPg(db: Db): Promise<{ n: number }[]> {
  return db.query<{ n: number }>('SELECT count(*)::int AS n FROM admins');
}

async function isAdminRowsPg(db: Db, listenerId: string): Promise<{ ok: boolean }[]> {
  return db.query<{ ok: boolean }>('SELECT EXISTS (SELECT 1 FROM admins WHERE listener_id = $1) AS ok', [listenerId]);
}

async function insertAuditPg(db: Db, ctx: AuditCtx, meta: AuditMeta, before: unknown, after: unknown): Promise<void> {
  await db.query(
    `INSERT INTO admin_audit (admin_id, acting_as, area, action, target, before, after, device)
     VALUES ($1, $2, $3, $4, $5, ($6::text)::jsonb, ($7::text)::jsonb, $8)`,
    [ctx.adminId, ctx.actingAs ?? null, meta.area, meta.action, meta.target.slice(0, 2048), jsonb(asObject(before)), jsonb(asObject(after)), ctx.device ?? null],
  );
}

/**
 * M15 T003 — every admin write: read before → write → read after → one audit row, in ONE
 * transaction, so a write cannot happen without its record (G-A2) and a failed record undoes it.
 */
async function adminWritePg<T>(db: Db, ctx: AuditCtx, meta: AuditMeta, read: (tx: Db) => Promise<unknown>, write: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const before = await read(tx);
    const result = await write(tx);
    const after = await read(tx);
    await insertAuditPg(tx, ctx, meta, before, after);
    return result;
  });
}

/** Removes an admin role; the database refuses the last one (trigger `admins_keep_one`, migration 014). */
async function removeAdminPg(db: Db, listenerId: string): Promise<void> {
  await db.query('DELETE FROM admins WHERE listener_id = $1', [listenerId]);
}

// M26 lane SF: each runs on Postgres, or on DynamoDB (safety/ddb/admin-access.ts) when the Db carries a Store (db/backend.ts).
export const insertOwnerAdmin = dual('sf/admin-access', 'insertOwnerAdmin', insertOwnerAdminPg);
export const countAdminsRows = dual('sf/admin-access', 'countAdminsRows', countAdminsRowsPg);
export const isAdminRows = dual('sf/admin-access', 'isAdminRows', isAdminRowsPg);
export const insertAudit = dual('sf/admin-access', 'insertAudit', insertAuditPg);
export const adminWrite = dual('sf/admin-access', 'adminWrite', adminWritePg);
export const removeAdmin = dual('sf/admin-access', 'removeAdmin', removeAdminPg);
