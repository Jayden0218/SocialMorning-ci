/**
 * Admin API (`/v1/admin/*`, owner only) — US1: the record
 */
import { ApiError } from '../../errors.ts';
import { isArea, listAudit } from '../../db/repos/admin-audit.ts';
import type { Hono } from 'hono';
import type { AdminEnv } from '../../auth/admin.ts';

export function registerRecord(admin: Hono<AdminEnv>): void {
  admin.get('/audit', async (c) => {
    const area = c.req.query('area') || undefined;
    const before = c.req.query('before') || undefined;
    if (area !== undefined && !isArea(area)) throw new ApiError('validation', 'Unknown area.', { fields: ['area'] });
    if (before !== undefined && !/^\d{1,18}$/.test(before)) throw new ApiError('validation', 'before must be a record id.', { fields: ['before'] });
    return c.json(await listAudit(c.get('db'), { ...(area ? { area } : {}), ...(before ? { before } : {}) }));
  });
}
