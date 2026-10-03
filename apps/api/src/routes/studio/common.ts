// Helpers shared by Studio routes: owner-only check, date ranges, CSV answers.
/**
 * Studio API — helpers more than one Studio area uses (the owner-only wall, ranges, CSV answers).
 */
import { type MiddlewareHandler } from 'hono';
import { type StudioEnv } from '../../auth/studio-session.ts';
import { ApiError } from '../../errors.ts';
import { z } from 'zod';
import { METRICS, type Metric } from '../../db/repos/studio/studio-numbers.ts';
import { release, team } from '../../db/repos/studio/show-team.ts';
import { CATEGORIES, hostedByFeed } from '../../db/repos/studio/hosted.ts';

export const showDetails = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000).optional(),
  author: z.string().trim().max(100).optional(),
  language: z.string().regex(/^[a-z]{2}(-[A-Za-z]{2,4})?$/).optional(),
  category: z.enum(CATEGORIES).optional(),
  explicit: z.boolean().optional(),
});

/** Owner-only routes (G-A2): settings, team, tips, release. */
export const ownerOnly: MiddlewareHandler<StudioEnv> = async (c, next) => {
  if (c.get('show').role !== 'owner') throw new ApiError('owner_only', 'Only the owner of this show can do this.');
  await next();
};

export const days = (v: string | undefined): 7 | 30 | 90 => (v === '7' ? 7 : v === '90' ? 90 : 30);

export const metric = (v: string | undefined): Metric => ((METRICS as readonly string[]).includes(v ?? '') ? (v as Metric) : 'plays');

export const https = z.string().trim().max(2048).regex(/^https:\/\/\S+$/, 'must be an https link');

/** The created show behind this Studio show, or 404 — a claimed feed has no uploads. */
export async function hostedOf(db: import('../../db/db.ts').Db, feedUrl: string) {
  const h = await hostedByFeed(db, feedUrl);
  if (!h) throw new ApiError('not_found', 'This show comes from another feed; its episodes are published there.');
  return h;
}
