import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { listPositions, observePosition, toPublic } from '../db/repos/positions.ts';

const observation = z.object({
  episodeId: z.string().min(1).max(64),
  offsetMs: z.number().int().min(0),
  finished: z.boolean(),
  progressSeq: z.number().int().min(0),
  explicitSeek: z.boolean(),
});
const putBody = z.object({
  deviceId: z.string().min(1).max(80),
  observations: z.array(observation).min(1).max(100),
});

export const positions = new Hono<AuthEnv>();

/** PUT /v1/me/positions — merge each observation (research R5) and return the standing rows. */
positions.put('/', requireAuth, json(putBody), async (c) => {
  const db = c.get('db');
  const listener = c.get('listener')!;
  const body = c.req.valid('json');

  const ids = [...new Set(body.observations.map((o) => o.episodeId))];
  const known = await db.query<{ id: string }>('SELECT id FROM episodes WHERE id = ANY($1::text[])', [ids]);
  const knownSet = new Set(known.map((r) => r.id));
  const unknown = ids.find((id) => !knownSet.has(id));
  if (unknown) throw new ApiError('not_found', `Episode ${unknown} is not registered — PUT /v1/episodes/${unknown} first.`, { episodeId: unknown });

  const now = new Date();
  const rows = await db.transaction(async (tx) => {
    const out = [];
    for (const o of body.observations) out.push(await observePosition(tx, listener.id, body.deviceId, o, now));
    return out;
  });
  return c.json({ positions: rows.map(toPublic) });
});

positions.get('/', requireAuth, async (c) => {
  const since = c.req.query('since');
  const sinceDate = since ? new Date(since) : undefined;
  if (sinceDate && Number.isNaN(sinceDate.getTime())) throw new ApiError('validation', '`since` must be an ISO-8601 time.');
  const rows = await listPositions(c.get('db'), c.get('listener')!.id, sinceDate);
  return c.json({ positions: rows.map(toPublic), serverTime: new Date().toISOString() });
});
