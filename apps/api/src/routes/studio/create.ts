// Studio routes to create a new show and check storage status.
/**
 * Studio API (`/v1/studio/*`) — M13: create a show here
 */
import { ApiError } from '../../errors.ts';
import { showsFor } from '../../db/repos/studio/studio-roles.ts';
import { json } from '../../validate.ts';
import { createHostedShow, ownedShowCountRows, storedBytes } from '../../db/repos/studio/hosted.ts';
import { MAX_AUDIO_BYTES } from '../../storage/episodes-blob.ts';
import type { Hono } from 'hono';
import { showDetails } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerCreate(studio: Hono<StudioEnv>): void {
  studio.post('/hosted-shows', json(showDetails), async (c) => {
    const db = c.get('db');
    const me = c.get('listener')!;
    const [n] = await ownedShowCountRows(db, me.id);
    if (Number(n?.n ?? 0) >= 5) throw new ApiError('conflict', 'One account can create 5 shows.', { reason: 'too_many_shows' });
    const show = await createHostedShow(db, me.id, c.get('publicBase'), c.req.valid('json'));
    return c.json({ show, shows: await showsFor(db, me.id) }, 201);
  });

  studio.get('/storage', async (c) =>
    c.json({ ready: c.get('storage').ready, usedBytes: await storedBytes(c.get('db')), ceilingBytes: c.get('hostedCeilingBytes'), maxAudioBytes: MAX_AUDIO_BYTES }));
}
