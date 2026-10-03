/**
 * Studio API (`/v1/studio/*`) — M14 US2: hosts
 */
import { acceptInvite, createInvite, listHosts, openInvites, previewInvite, removeHost, revokeInvite } from '../../db/repos/show-hosts.ts';
import type { Hono } from 'hono';
import { ownerOnly, https } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerHosts(studio: Hono<StudioEnv>): void {
  const studioBase = () => process.env['STUDIO_URL'] ?? 'https://socialmorning-studio.vercel.app';

  studio.get('/shows/:show/hosts', async (c) => c.json({ hosts: await listHosts(c.get('db'), c.get('show').feedUrl) }));

  studio.delete('/shows/:show/hosts/:listenerId', ownerOnly, async (c) => {
    await removeHost(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'));
    return c.body(null, 204);
  });

  studio.get('/shows/:show/host-invites', ownerOnly, async (c) => c.json({ invites: await openInvites(c.get('db'), c.get('show').feedUrl) }));

  /** The link is shown once; only its hash is kept. */
  studio.post('/shows/:show/host-invites', ownerOnly, async (c) => {
    const inv = await createInvite(c.get('db'), c.get('show').feedUrl, c.get('listener')!.id);
    return c.json({ id: inv.id, url: `${studioBase()}/invite/${inv.token}`, expiresAt: inv.expiresAt }, 201);
  });

  studio.delete('/shows/:show/host-invites/:id', ownerOnly, async (c) => {
    await revokeInvite(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    return c.body(null, 204);
  });

  studio.get('/invites/:token', async (c) => c.json(await previewInvite(c.get('db'), c.req.param('token'))));

  studio.post('/invites/:token/accept', async (c) => {
    const r = await acceptInvite(c.get('db'), c.req.param('token'), c.get('listener')!.id);
    return c.json({ feedUrl: r.feedUrl });
  });
}
