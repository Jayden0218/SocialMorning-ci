// Queue sync routes: read the account's play queue, and replace it from the version the phone last saw.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { getQueue, putQueue, SYNCED_QUEUE_MAX } from '../../db/repos/account/queue.ts';

const body = z.object({
  items: z.array(z.string().min(1).max(64)).max(SYNCED_QUEUE_MAX),
  baseVersion: z.number().int().min(0),
  deviceId: z.string().min(1).max(64),
});

/**
 * M22 US4 — mounted at /v1/me/queue (contracts/api.md "Queue").
 *   GET → `{ items, version, deviceId, updatedAt }` (empty list, version 0 when none).
 *   PUT `{ items ≤ 300, baseVersion, deviceId }` → 200 `{ version }`, or 409 with the
 *   account's list `{ error: 'conflict', items, version, deviceId, updatedAt }` when
 *   `baseVersion` is not the stored version — nothing is written (guard G-M22-3).
 */
export const queue = new Hono<AuthEnv>();

queue.get('/', requireAuth, async (c) => c.json(await getQueue(c.get('db'), c.get('listener')!.id)));

queue.put('/', requireAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  const r = await putQueue(c.get('db'), c.get('listener')!.id, b.items, b.baseVersion, b.deviceId);
  if (!r.ok) return c.json({ error: 'conflict', message: 'The playlist changed on another device.', ...r.current }, 409);
  return c.json({ version: r.version });
});
