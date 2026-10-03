/**
 * Studio API (`/v1/studio/*`) — US6: Settings, team, release
 */
import { ApiError } from '../../errors.ts';
import { z } from 'zod';
import { json } from '../../validate.ts';
import { getOverrides, putOverrides } from '../../db/repos/studio/show-overrides.ts';
import { addOperator, release, removeOperator, team } from '../../db/repos/studio/show-team.ts';
import { hostedByFeed, listHostedEpisodes } from '../../db/repos/studio/hosted.ts';
import { CONTACT_TYPES } from '../../db/repos/studio/show-overrides.ts';
import type { Hono } from 'hono';
import { ownerOnly, https } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerSettings(studio: Hono<StudioEnv>): void {
  const overridesBody = z.object({
    title: z.string().trim().min(1).max(100).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    coverUrl: https.nullable().optional(),
    themeColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    milestoneMessage: z.string().trim().max(120).nullable().optional(),
    hosts: z.array(z.string().trim().min(1).max(40)).max(5).nullable().optional(),
    links: z.array(z.object({ label: z.string().trim().min(1).max(20), url: https })).max(5).nullable().optional(),
    contacts: z.array(z.object({ type: z.enum(CONTACT_TYPES), value: z.string().trim().min(1).max(200) })).max(6).nullable().optional(),
    tipsEnabled: z.boolean().optional(),
  }).strict().superRefine((b, ctx) => {
    // M14 US3 (FR-04): each contact is checked for its type.
    for (const [i, c] of (b.contacts ?? []).entries()) {
      const ok = c.type === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)
        : c.type === 'wechat' || c.type === 'wechat_official' ? /^[\w\-\u4e00-\u9fff]{1,50}$/.test(c.value)
        : /^https:\/\/\S+$/.test(c.value);
      if (!ok) ctx.addIssue({ code: 'custom', path: ['contacts', i, 'value'], message: `Not a valid ${c.type}` });
    }
  });

  studio.get('/shows/:show/overrides', ownerOnly, async (c) => c.json({ overrides: await getOverrides(c.get('db'), c.get('show').feedUrl) }));

  studio.put('/shows/:show/overrides', ownerOnly, json(overridesBody), async (c) =>
    c.json({ overrides: await putOverrides(c.get('db'), c.get('show').feedUrl, c.get('listener')!.id, c.req.valid('json') as never) }));

  studio.get('/shows/:show/team', ownerOnly, async (c) => c.json(await team(c.get('db'), c.get('show').feedUrl)));

  studio.post('/shows/:show/team', ownerOnly, json(z.object({ email: z.string().trim().toLowerCase().email().max(254) })), async (c) => {
    await addOperator(c.get('db'), c.get('show').feedUrl, c.req.valid('json').email, c.get('listener')!.id);
    return c.json(await team(c.get('db'), c.get('show').feedUrl), 201);
  });

  studio.delete('/shows/:show/team/:listenerId', ownerOnly, async (c) => {
    await removeOperator(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'));
    return c.body(null, 204);
  });

  /** The owner types the show's title to confirm, so a stray click cannot give the show away. */
  studio.post('/shows/:show/release', ownerOnly, json(z.object({ confirm: z.string() })), async (c) => {
    const show = c.get('show');
    if (c.req.valid('json').confirm.trim() !== (show.title ?? show.feedUrl).trim()) {
      throw new ApiError('validation', 'Type the show\'s name exactly to confirm.', { fields: ['confirm'] });
    }
    const hosted = await hostedByFeed(c.get('db'), show.feedUrl);
    await release(c.get('db'), show.feedUrl);
    if (hosted) {
      // A show made here has no other home: giving it back deletes it and its audio (the feed answers 410).
      const eps = await listHostedEpisodes(c.get('db'), hosted.id);
      await c.get('db').query('UPDATE hosted_shows SET deleted_at = now() WHERE id = $1', [hosted.id]);
      await c.get('db').query('UPDATE hosted_episodes SET deleted_at = now() WHERE show_id = $1 AND deleted_at IS NULL', [hosted.id]);
      for (const e of eps) await c.get('storage').remove(e.audioUrl).catch(() => undefined);
    }
    return c.body(null, 204);
  });
}
