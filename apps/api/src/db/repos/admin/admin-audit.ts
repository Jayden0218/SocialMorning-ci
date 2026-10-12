// Reads the admin action record, newest first, 50 per page, by area.
/**
 * M15 T008 — reading the admin record (FR-005): newest first, 50 a page, by area. Rows are only
 * ever inserted (`auth/admin.ts` `insertAudit`); the record refuses update and delete (G-A3).
 */
import { viaStore } from '../../backend.ts';
import { AUDIT_AREAS, type AuditArea } from '../../../auth/admin.ts';

export const AUDIT_PAGE = 50;

export type AuditRow = {
  id: string; at: string; adminId: string; adminName: string | null; actingAs: string | null; actingAsName: string | null;
  area: AuditArea; action: string; target: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; device: string | null;
};

export const isArea = (v: string | undefined): v is AuditArea => v !== undefined && (AUDIT_AREAS as readonly string[]).includes(v);

// DynamoDB body: safety/ddb/admin-audit.ts (db/backend.ts).
export const listAudit = viaStore<typeof import('../safety/ddb/admin-audit.ts').listAudit>('sf/admin-audit', 'listAudit');
