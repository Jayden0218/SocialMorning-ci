// Reads the admin action record, newest first, 50 per page, by area.
/**
 * M15 T008 — reading the admin record (FR-005): newest first, 50 a page, by area. Rows are only
 * ever inserted (`auth/admin.ts` `insertAudit`); the table refuses UPDATE and DELETE (G-A3).
 */
import type { Db } from '../../db.ts';
import { AUDIT_AREAS, type AuditArea } from '../../../auth/admin.ts';

export const AUDIT_PAGE = 50;

export type AuditRow = {
  id: string; at: string; adminId: string; adminName: string | null; actingAs: string | null; actingAsName: string | null;
  area: AuditArea; action: string; target: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; device: string | null;
};

const obj = (v: unknown): Record<string, unknown> | null => {
  if (v === null || v === undefined) return null;
  const x = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : { value: x };
};

export const isArea = (v: string | undefined): v is AuditArea => v !== undefined && (AUDIT_AREAS as readonly string[]).includes(v);

export async function listAudit(db: Db, opts: { area?: AuditArea; before?: string }): Promise<{ items: AuditRow[]; next?: string }> {
  const rows = await db.query<{
    id: string; at: Date | string; admin_id: string; admin_name: string | null; acting_as: string | null; acting_name: string | null;
    area: AuditArea; action: string; target: string; before: unknown; after: unknown; device: string | null;
  }>(
    `SELECT a.id::text AS id, a.at, a.admin_id, la.display_name AS admin_name, a.acting_as, lb.display_name AS acting_name,
            a.area, a.action, a.target, a.before, a.after, a.device
       FROM admin_audit a
       LEFT JOIN listeners la ON la.id = a.admin_id
       LEFT JOIN listeners lb ON lb.id = a.acting_as
      WHERE ($1::text IS NULL OR a.area = $1::text) AND ($2::bigint IS NULL OR a.id < $2::bigint)
      ORDER BY a.id DESC
      LIMIT $3`,
    [opts.area ?? null, opts.before ?? null, AUDIT_PAGE + 1],
  );
  const page = rows.slice(0, AUDIT_PAGE).map((r) => ({
    id: String(r.id), at: new Date(r.at).toISOString(), adminId: r.admin_id, adminName: r.admin_name, actingAs: r.acting_as, actingAsName: r.acting_name,
    area: r.area, action: r.action, target: r.target, before: obj(r.before), after: obj(r.after), device: r.device,
  }));
  const last = page[page.length - 1];
  return rows.length > AUDIT_PAGE && last ? { items: page, next: last.id } : { items: page };
}
