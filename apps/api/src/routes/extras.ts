/**
 * M11 — what the APP reads and writes for a show's creator features (contracts/studio-api.md,
 * "App-facing"). The show page fetches RSS on the phone (research R7), so the creator's
 * overrides, announcements and polls arrive in ONE call made after the feed has loaded; if it
 * fails, the page stays exactly as the feed draws it (Principle IV).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth, requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { pollsForApp, vote } from '../db/repos/polls.ts';
import { getOverrides } from '../db/repos/show-overrides.ts';
import { listHosts } from '../db/repos/show-hosts.ts';

export const extras = new Hono<AuthEnv>();

extras.get('/shows/extras', optionalAuth, async (c) => {
  const feedUrl = c.req.query('feedUrl') ?? '';
  if (!/^https?:\/\//.test(feedUrl) || feedUrl.length > 2048) throw new ApiError('validation', 'feedUrl is required.', { fields: ['feedUrl'] });
  const db = c.get('db');
  const viewer = c.get('listener');
  const [overrides, announcements, polls, hosts] = await Promise.all([
    getOverrides(db, feedUrl),
    db.query<{ id: string; body: string; created_at: Date | string; edited_at: Date | string | null }>(
      'SELECT id, body, created_at, edited_at FROM announcements WHERE feed_url = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3', [feedUrl]),
    pollsForApp(db, feedUrl, viewer?.id),
    listHosts(db, feedUrl),
  ]);
  c.header('Cache-Control', viewer ? 'private, no-store' : 'public, max-age=60');
  return c.json({
    overrides,
    announcements: announcements.map((a) => ({ id: a.id, body: a.body, createdAt: new Date(a.created_at).toISOString(), edited: a.edited_at !== null })),
    polls,
    // M14: invited hosts (real accounts) and whether tips are switched on.
    hostAccounts: hosts.map((h) => ({ id: h.id, displayName: h.displayName })),
    tipsEnabled: overrides?.tipsEnabled ?? false,
  });
});

extras.post('/polls/:id/vote', requireAuth, json(z.object({ optionIdx: z.number().int().min(0).max(5) })), async (c) =>
  c.json({ poll: await vote(c.get('db'), c.req.param('id'), c.get('listener')!.id, c.req.valid('json').optionIdx) }));

const shareBody = z.object({
  targetKind: z.enum(['episode', 'clip', 'show']),
  targetId: z.string().min(1).max(2048),
  feedUrl: z.string().url().max(2048),
});

/** FR-011: the share sheet opened. Anonymous is fine; the phone never waits for this. */
extras.post('/shares', optionalAuth, json(shareBody), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  const me = c.get('listener');
  if (me) {
    const [recent] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM share_events WHERE listener_id = $1 AND at > now() - interval '1 minute'", [me.id]);
    if (Number(recent?.n ?? 0) >= 30) return c.body(null, 204); // a burst is not 30 shares; drop quietly
  }
  await db.query('INSERT INTO share_events (listener_id, target_kind, target_id, feed_url) VALUES ($1, $2, $3, $4)', [me?.id ?? null, b.targetKind, b.targetId, b.feedUrl]);
  return c.body(null, 204);
});
