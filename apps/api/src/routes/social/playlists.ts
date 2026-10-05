// Playlist routes: my playlists, one playlist, its order, and an account's public ones.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { addItem, createPlaylist, deletePlaylist, getPlaylist, myPlaylists, playlistsOf, setItems, updatePlaylist, PLAYLIST_ITEMS_MAX } from '../../db/repos/social/playlists.ts';

const title = z.string().trim().min(1).max(60);

/** M19 US4 — mounted at /v1/me/playlists. */
export const myPlaylistRoutes = new Hono<AuthEnv>();

myPlaylistRoutes.get('/', requireAuth, async (c) => c.json({ items: await myPlaylists(c.get('db'), c.get('listener')!.id) }));

myPlaylistRoutes.post('/', requireAuth, json(z.object({ title, isPublic: z.boolean().optional() })), async (c) => {
  const b = c.req.valid('json');
  return c.json(await createPlaylist(c.get('db'), c.get('listener')!.id, b.title, b.isPublic ?? false));
});

myPlaylistRoutes.patch('/:id', requireAuth, json(z.object({ title: title.optional(), isPublic: z.boolean().optional() })), async (c) => {
  const b = c.req.valid('json');
  return c.json(await updatePlaylist(c.get('db'), c.req.param('id'), c.get('listener')!.id, { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.isPublic !== undefined ? { isPublic: b.isPublic } : {}) }));
});

myPlaylistRoutes.delete('/:id', requireAuth, async (c) => {
  await deletePlaylist(c.get('db'), c.req.param('id'), c.get('listener')!.id);
  return c.body(null, 204);
});

myPlaylistRoutes.put('/:id/items', requireAuth, json(z.object({ episodeIds: z.array(z.string().min(1).max(64)).max(PLAYLIST_ITEMS_MAX + 1) })), async (c) =>
  c.json(await setItems(c.get('db'), c.req.param('id'), c.get('listener')!.id, c.req.valid('json').episodeIds)));

myPlaylistRoutes.post('/:id/items', requireAuth, json(z.object({ episodeId: z.string().min(1).max(64) })), async (c) =>
  c.json(await addItem(c.get('db'), c.req.param('id'), c.get('listener')!.id, c.req.valid('json').episodeId)));

/** M19 US4 — mounted at /v1/playlists: GET /:id (public, or the owner's own private one). */
export const playlistRoutes = new Hono<AuthEnv>();

playlistRoutes.get('/:id', optionalAuth, async (c) => {
  const p = await getPlaylist(c.get('db'), c.req.param('id'), c.get('listener')?.id);
  if (!p) throw new ApiError('not_found', 'No such playlist.');
  return c.json(p);
});

/** M19 US4 — mounted at /v1/listeners: GET /:id/playlists. */
export const listenerPlaylists = new Hono<AuthEnv>();

listenerPlaylists.get('/:id/playlists', optionalAuth, async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such listener.');
  return c.json({ items: await playlistsOf(c.get('db'), id, c.get('listener')?.id) });
});
