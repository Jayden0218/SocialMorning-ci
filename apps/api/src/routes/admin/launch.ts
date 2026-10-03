/**
 * Admin API (`/v1/admin/*`, owner only) — US3: the launch screen
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adminWrite, auditCtx } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { createPromotion, getPromotion, launchBytes, listPromotions, updatePromotion, type PromotionInput } from '../../db/repos/promotions.ts';
import { LAUNCH_CEILING_BYTES, LAUNCH_IMAGE_TYPES, MAX_LAUNCH_IMAGE_BYTES, launchPathname, launchUploadToken, type EpisodeStorage } from '../../storage/episodes-blob.ts';
import type { Db } from '../../db/db.ts';
import type { Hono } from 'hono';
import { target } from './common.ts';
import type { AdminEnv } from '../../auth/admin.ts';

export function registerLaunch(admin: Hono<AdminEnv>): void {
  const mbs = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

  /** G-L3: one image ≤ 1 MB, and every counted image together ≤ 50 MB. */
  async function checkLaunchRoom(db: Db, size: number, exceptId?: string): Promise<void> {
    if (size > MAX_LAUNCH_IMAGE_BYTES) throw new ApiError('validation', 'The image is over 1 MB. Make it smaller and try again.', { fields: ['size'] });
    const used = await launchBytes(db, exceptId);
    if (used + size > LAUNCH_CEILING_BYTES) {
      throw new ApiError('storage_full', `Launch images are full: ${mbs(used)} of ${mbs(LAUNCH_CEILING_BYTES)} used. Retire a promotion first.`, { usedBytes: used, ceilingBytes: LAUNCH_CEILING_BYTES });
    }
  }

  admin.post('/launch/uploads', json(z.object({ contentType: z.string().max(100), size: z.number().int().positive() })), async (c) => {
    const b = c.req.valid('json');
    const storage = c.get('storage');
    if (!LAUNCH_IMAGE_TYPES.includes(b.contentType)) throw new ApiError('validation', 'Upload a JPEG, PNG or WebP image.', { fields: ['contentType'] });
    await checkLaunchRoom(c.get('db'), b.size);
    if (!storage.ready) throw new ApiError('unavailable', 'The image store is not connected yet.');
    const pathname = launchPathname(b.contentType, randomUUID())!;
    return c.json({ pathname, token: await launchUploadToken(storage, pathname, b.size, b.contentType) });
  });

  admin.get('/launch', async (c) => c.json({ items: await listPromotions(c.get('db')), usedBytes: await launchBytes(c.get('db')), ceilingBytes: LAUNCH_CEILING_BYTES, maxImageBytes: MAX_LAUNCH_IMAGE_BYTES }));

  const launchFields = {
    targetKind: z.enum(['route', 'url']),
    target,
    label: z.string().trim().min(1).max(20).optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    weight: z.number().int().min(1).max(100).optional(),
    dailyCap: z.number().int().min(1).max(5).optional(),
  };

  /** A `url` target must be https; a `route` is an in-app path (the phone opens Discover if it no longer exists). */
  function checkTarget(kind: 'route' | 'url', t: string): void {
    if (kind === 'url' && !/^https:\/\/[^\s]+$/.test(t)) throw new ApiError('validation', 'A web address must start with https://.', { fields: ['target'] });
    if (kind === 'route' && !/^\/[A-Za-z0-9/_\-[\]().?=&%]*$/.test(t)) throw new ApiError('validation', 'An in-app page starts with /.', { fields: ['target'] });
  }

  /** The image must really be in our store under launch/, an allowed type, within the limits. */
  async function storedImage(storage: EpisodeStorage, db: Db, url: string, exceptId?: string) {
    const f = await storage.head(url);
    if (!f || !f.pathname.startsWith('launch/') || !LAUNCH_IMAGE_TYPES.includes(f.contentType)) throw new ApiError('validation', 'Upload the image first.', { fields: ['imageUrl'] });
    await checkLaunchRoom(db, f.size, exceptId);
    return f;
  }

  admin.post('/launch', json(z.object({ imageUrl: z.string().url().max(2048), ...launchFields })), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    checkTarget(b.targetKind, b.target);
    if (Date.parse(b.endsAt) <= Date.parse(b.startsAt)) throw new ApiError('validation', 'The end must be after the start.', { fields: ['endsAt'] });
    const f = await storedImage(c.get('storage'), db, b.imageUrl);
    const input: PromotionInput = {
      imageUrl: f.url, imagePath: f.pathname, imageBytes: f.size, targetKind: b.targetKind, target: b.target, label: b.label ?? 'Promotion',
      startsAt: b.startsAt, endsAt: b.endsAt, weight: b.weight ?? 1, dailyCap: b.dailyCap ?? 1,
    };
    let id = '';
    const promotion = await adminWrite(db, auditCtx(c), { area: 'launch', action: 'create', target: 'new' },
      async (tx) => (id ? ((await getPromotion(tx, id)) ?? null) : null),
      async (tx) => { const p = await createPromotion(tx, input); id = p.id; return p; });
    return c.json({ promotion }, 201);
  });

  admin.patch('/launch/:id', json(z.object({ imageUrl: z.string().url().max(2048).optional(), ...launchFields, retired: z.boolean().optional() }).partial()), async (c) => {
    const id = c.req.param('id');
    const b = c.req.valid('json');
    const db = c.get('db');
    const cur = await getPromotion(db, id);
    if (!cur) throw new ApiError('not_found', 'No such promotion.');
    const kind = b.targetKind ?? cur.targetKind;
    checkTarget(kind, b.target ?? cur.target);
    if (Date.parse(b.endsAt ?? cur.endsAt) <= Date.parse(b.startsAt ?? cur.startsAt)) throw new ApiError('validation', 'The end must be after the start.', { fields: ['endsAt'] });
    const f = b.imageUrl && b.imageUrl !== cur.imageUrl ? await storedImage(c.get('storage'), db, b.imageUrl, id) : undefined;
    if (b.retired === false && cur.state === 'retired') await checkLaunchRoom(db, cur.imageBytes, id);
    const promotion = await adminWrite(db, auditCtx(c), { area: 'launch', action: b.retired === true ? 'retire' : 'edit', target: id },
      async (tx) => (await getPromotion(tx, id)) ?? null,
      (tx) => updatePromotion(tx, id, {
        ...(f ? { imageUrl: f.url, imagePath: f.pathname, imageBytes: f.size } : {}),
        ...(b.targetKind ? { targetKind: b.targetKind } : {}), ...(b.target ? { target: b.target } : {}), ...(b.label ? { label: b.label } : {}),
        ...(b.startsAt ? { startsAt: b.startsAt } : {}), ...(b.endsAt ? { endsAt: b.endsAt } : {}),
        ...(b.weight !== undefined ? { weight: b.weight } : {}), ...(b.dailyCap !== undefined ? { dailyCap: b.dailyCap } : {}),
        ...(b.retired !== undefined ? { retired: b.retired } : {}),
      }));
    return c.json({ promotion });
  });
}
