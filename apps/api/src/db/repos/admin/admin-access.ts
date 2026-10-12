// Admin access: who is admin, and the admin action record.
import { viaStore } from '../../backend.ts';

/** `jsonb` serialises a before/after snapshot (`null` stays null); `asObject` makes sure what is stored is an object (guard G-A4). */
export const jsonb = (v: Record<string, unknown> | null): string | null => (v === null ? null : JSON.stringify(v));
export function asObject(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return { items: v };
  if (typeof v === 'object') return v as Record<string, unknown>;
  return { value: v };
}

// DynamoDB bodies: safety/ddb/admin-access.ts (db/backend.ts).
export const insertOwnerAdmin = viaStore<typeof import('../safety/ddb/admin-access.ts').insertOwnerAdmin>('sf/admin-access', 'insertOwnerAdmin');
export const countAdminsRows = viaStore<typeof import('../safety/ddb/admin-access.ts').countAdminsRows>('sf/admin-access', 'countAdminsRows');
export const isAdminRows = viaStore<typeof import('../safety/ddb/admin-access.ts').isAdminRows>('sf/admin-access', 'isAdminRows');
export const insertAudit = viaStore<typeof import('../safety/ddb/admin-access.ts').insertAudit>('sf/admin-access', 'insertAudit');
export const adminWrite = viaStore<typeof import('../safety/ddb/admin-access.ts').adminWrite>('sf/admin-access', 'adminWrite');
export const removeAdmin = viaStore<typeof import('../safety/ddb/admin-access.ts').removeAdmin>('sf/admin-access', 'removeAdmin');
