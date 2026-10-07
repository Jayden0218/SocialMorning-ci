// Studio routes for money: the show's tips, and its earnings (sales, gifts, tips, refunds) with a CSV. Owner only.
/**
 * Studio API (`/v1/studio/*`) — US7: Tips; M24 US9: Earnings
 */
import { tipsFor } from '../../db/repos/studio/studio-tips.ts';
import { earnings, earningsCsv } from '../../db/repos/studio/studio-earnings.ts';
import type { Hono } from 'hono';
import { ownerOnly } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerTips(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/tips', ownerOnly, async (c) => c.json(await tipsFor(c.get('db'), c.get('show').feedUrl)));

  /** M24 US9: paid-show sales, gifts and tips per month, refunds apart; newest 200 rows. */
  studio.get('/shows/:show/earnings', ownerOnly, async (c) => c.json(await earnings(c.get('db'), c.get('show').feedUrl)));

  studio.get('/shows/:show/export/earnings.csv', ownerOnly, async (c) =>
    new Response(await earningsCsv(c.get('db'), c.get('show').feedUrl), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="earnings-${c.get('show').key}.csv"`,
        'cache-control': 'private, no-store',
      },
    }));
}
