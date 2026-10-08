// Admin routes for the app settings (Admin › App settings): read every key, save one, reset one.
/**
 * M25 A7 (`/v1/admin/config*`, owner only — behind `adminOnly` like every admin route).
 * A save is checked by the shared `checkConfig` (422 with the reason), version-checked (409
 * `changed`), recorded in `admin_audit` (area `config`), and drops the public memo so the next
 * `GET /v1/config` carries it.
 */
import { z } from 'zod';
import { CONFIG_DEFAULTS, DEFAULT_GENRE_ORDER, DISCOVER_SECTION_TITLES, LIST_SIZES, SHORTCUT_IDS, SHORTCUT_LABELS, checkConfig, isConfigKey, readConfig, type ConfigKey } from '@socialmorning/social-core';
import type { Hono } from 'hono';
import { adminWrite, auditCtx, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { APPLE_GENRES, genreName } from '../../catalog/genres.ts';
import { dropConfigMemo, getConfigRow, listConfigRows, putConfig, resetConfig } from '../../db/repos/config/app-config.ts';
import { version } from './common.ts';

const keyParam = (k: string): ConfigKey => {
  if (!isConfigKey(k)) throw new ApiError('not_found', 'No such setting.');
  return k;
};

const KNOWN_GENRES = new Set(Object.values(APPLE_GENRES));

export function registerConfig(admin: Hono<AdminEnv>): void {
  admin.get('/config', async (c) => {
    const rows = await listConfigRows(c.get('db'));
    const raw: Record<string, unknown> = {};
    for (const r of rows) raw[r.key] = r.value;
    const effective = readConfig(raw);
    return c.json({
      items: (Object.keys(CONFIG_DEFAULTS) as ConfigKey[]).map((key) => {
        const row = rows.find((r) => r.key === key);
        return { key, value: effective[key], saved: row !== undefined, version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null };
      }),
      defaults: CONFIG_DEFAULTS,
      // What the editors list: every tile, every genre (bundled order), every section title, every size.
      shortcuts: SHORTCUT_IDS.map((id) => ({ id, label: SHORTCUT_LABELS[id] })),
      genres: DEFAULT_GENRE_ORDER.map((id) => ({ id, name: genreName(id) ?? String(id) })),
      sectionTitles: DISCOVER_SECTION_TITLES,
      listSizes: LIST_SIZES,
    });
  });

  admin.put('/config/:key', json(z.object({ version, value: z.unknown() })), async (c) => {
    const key = keyParam(c.req.param('key'));
    const b = c.req.valid('json');
    const checked = checkConfig(key, b.value);
    if (!checked.ok) throw new ApiError('validation', checked.error, { fields: ['value'] });
    if (key === 'genres') {
      const unknown = (checked.value as { id: number }[]).find((g) => !KNOWN_GENRES.has(g.id));
      if (unknown) throw new ApiError('validation', `Unknown category ${unknown.id}.`, { fields: ['value'] });
    }
    const db = c.get('db');
    const next = await adminWrite(db, auditCtx(c), { area: 'config', action: 'save', target: key },
      (tx) => getConfigRow(tx, key), (tx) => putConfig(tx, key, b.version, checked.value));
    dropConfigMemo(db);
    return c.json({ key, version: next, value: checked.value });
  });

  admin.delete('/config/:key', async (c) => {
    const key = keyParam(c.req.param('key'));
    const v = Number(c.req.query('version') ?? 'NaN');
    if (!Number.isInteger(v) || v < 0) throw new ApiError('validation', 'version is required.', { fields: ['version'] });
    const db = c.get('db');
    await adminWrite(db, auditCtx(c), { area: 'config', action: 'reset', target: key },
      (tx) => getConfigRow(tx, key), (tx) => resetConfig(tx, key, v));
    dropConfigMemo(db);
    return c.json({ key, version: 0, value: CONFIG_DEFAULTS[key] });
  });
}
