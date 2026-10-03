/**
 * Studio API (`/v1/studio/*`) — US7: Tips
 */
import { tipsFor } from '../../db/repos/studio/studio-tips.ts';
import type { Hono } from 'hono';
import { ownerOnly } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerTips(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/tips', ownerOnly, async (c) => c.json(await tipsFor(c.get('db'), c.get('show').feedUrl)));
}
