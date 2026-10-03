// Studio media library routes: list a show's stored files and delete unused ones.
/**
 * Studio API (`/v1/studio/*`) — M14 US5: the show's media library
 */
import { ApiError } from '../../errors.ts';
import { z } from 'zod';
import { json } from '../../validate.ts';
import { listHostedEpisodes, storedBytes } from '../../db/repos/studio/hosted.ts';
import type { Hono } from 'hono';
import { hostedOf } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerMedia(studio: Hono<StudioEnv>): void {
  /** Every file this show stored, and whether the feed or the show uses it (FR-06). */
  async function mediaOf(db: import('../../db/db.ts').Db, storage: import('../../storage/episodes-blob.ts').EpisodeStorage, feedUrl: string) {
    const h = await hostedOf(db, feedUrl);
    const [audio, covers, eps] = await Promise.all([storage.list(`episodes/${h.id}/`), storage.list(`covers/${h.id}/`), listHostedEpisodes(db, h.id)]);
    const used = new Map<string, string>();
    for (const e of eps) { used.set(e.audioUrl, e.title); if (e.coverUrl) used.set(e.coverUrl, `${e.title} (cover)`); }
    if (h.coverUrl) used.set(h.coverUrl, 'Show cover');
    const files = [...audio, ...covers].map((f) => ({ ...f, kind: f.pathname.startsWith('episodes/') ? 'audio' as const : 'image' as const, usedBy: used.get(f.url) ?? null }));
    return { files, usedBytes: files.reduce((n, f) => n + f.size, 0) };
  }

  studio.get('/shows/:show/media', async (c) => {
    const m = await mediaOf(c.get('db'), c.get('storage'), c.get('show').feedUrl);
    return c.json({ ...m, ceilingBytes: c.get('hostedCeilingBytes'), totalUsedBytes: await storedBytes(c.get('db')) });
  });

  studio.delete('/shows/:show/media', json(z.object({ url: z.string().url() })), async (c) => {
    const url = c.req.valid('json').url;
    const m = await mediaOf(c.get('db'), c.get('storage'), c.get('show').feedUrl);
    const f = m.files.find((x) => x.url === url);
    if (!f) throw new ApiError('not_found', 'No such file in this show.');
    if (f.usedBy) throw new ApiError('conflict', `In use by: ${f.usedBy}. Delete or change that first.`, { reason: 'in_use' });
    await c.get('storage').remove(url);
    return c.body(null, 204);
  });
}
