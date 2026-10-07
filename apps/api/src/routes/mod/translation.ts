// Moderator routes for translation: the allow-list of shows, today's Groq usage and the job queue.
/**
 * M22 US13 (FR-038, FR-039; contracts/api.md "Translation" /mod). Owner-only: every route runs the
 * Admin wall (`adminOnly` — a fresh Studio session of an admin; writes need `X-Studio: 1`). The
 * Studio's Admin › Translation page calls these.
 *  - GET    /v1/mod/translation-shows            → { items: { feedUrl, title, createdAt }[] }
 *  - PUT    /v1/mod/translation-shows/:feedUrl   → 204 (URL-encoded feed URL)
 *  - DELETE /v1/mod/translation-shows/:feedUrl   → 204
 *  - GET    /v1/mod/translation-usage            → { day, models: [{ model, requests, audioS, tokens, budget }], queue: [...] }
 *  - POST   /v1/mod/translation-jobs/retry       → 204 — a failed job goes back to the queue
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { GROQ_LIMITS, TRANSLATOR, WHISPER, budgetOf } from '@socialmorning/social-core';
import { adminOnly, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';

export const modTranslation = new Hono<AdminEnv>();

const feedOf = (raw: string): string => {
  let url: string;
  try { url = decodeURIComponent(raw); } catch { throw new ApiError('validation', 'Send the feed URL encoded.', { fields: ['feedUrl'] }); }
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2048) throw new ApiError('validation', 'That is not a feed URL.', { fields: ['feedUrl'] });
  return url;
};

modTranslation.get('/translation-shows', adminOnly, async (c) => {
  const rows = await c.get('db').query<{ feed_url: string; created_at: Date | string; title: string | null }>(
    `SELECT s.feed_url, s.created_at,
            coalesce(o.title, h.title, (SELECT e.show_title FROM episodes e WHERE e.feed_url = s.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title
       FROM translation_shows s
       LEFT JOIN show_overrides o ON o.feed_url = s.feed_url
       LEFT JOIN hosted_shows h ON h.feed_url = s.feed_url AND h.deleted_at IS NULL
      ORDER BY s.created_at DESC`);
  return c.json({ items: rows.map((r) => ({ feedUrl: r.feed_url, title: r.title, createdAt: new Date(r.created_at).toISOString() })) });
});

modTranslation.put('/translation-shows/:feedUrl', adminOnly, async (c) => {
  await c.get('db').query('INSERT INTO translation_shows (feed_url, added_by) VALUES ($1, $2) ON CONFLICT (feed_url) DO NOTHING', [feedOf(c.req.param('feedUrl')), c.get('listener')!.id]);
  return c.body(null, 204);
});

modTranslation.delete('/translation-shows/:feedUrl', adminOnly, async (c) => {
  await c.get('db').query('DELETE FROM translation_shows WHERE feed_url = $1', [feedOf(c.req.param('feedUrl'))]);
  return c.body(null, 204);
});

modTranslation.get('/translation-usage', adminOnly, async (c) => {
  const db = c.get('db');
  const [d] = await db.query<{ day: string }>("SELECT (now() AT TIME ZONE 'UTC')::date::text AS day");
  const used = await db.query<{ model: string; requests: number; audio_s: number; tokens: number }>(
    "SELECT model, requests, audio_s, tokens FROM groq_usage WHERE day = (now() AT TIME ZONE 'UTC')::date");
  const models = [WHISPER, TRANSLATOR].map((model) => {
    const u = used.find((r) => r.model === model);
    const l = GROQ_LIMITS[model];
    return {
      model, requests: Number(u?.requests ?? 0), audioS: Number(u?.audio_s ?? 0), tokens: Number(u?.tokens ?? 0),
      budget: { requests: budgetOf(l.rpd), ...(l.audioSPerDay ? { audioS: budgetOf(l.audioSPerDay) } : {}), ...(l.tpd ? { tokens: budgetOf(l.tpd) } : {}) },
    };
  });
  const queue = await db.query<{ episode_id: string; target_lang: string; state: string; title: string | null; error: string | null; requested_at: Date | string }>(
    `SELECT j.episode_id, j.target_lang, j.state, e.title, j.error, j.requested_at FROM translation_jobs j LEFT JOIN episodes e ON e.id = j.episode_id
      WHERE j.state <> 'done' OR j.updated_at > now() - interval '7 days' ORDER BY j.requested_at DESC LIMIT 100`);
  return c.json({
    day: d?.day ?? '', models,
    queue: queue.map((q) => ({ episodeId: q.episode_id, lang: q.target_lang, state: q.state, title: q.title, error: q.error, requestedAt: new Date(q.requested_at).toISOString() })),
  });
});

modTranslation.post('/translation-jobs/retry', adminOnly, json(z.object({ episodeId: z.string().min(1).max(200), lang: z.enum(['en', 'zh-Hans']) })), async (c) => {
  const b = c.req.valid('json');
  await c.get('db').query("UPDATE translation_jobs SET state = 'queued', errors = 0, error = NULL, not_before = NULL, segments = NULL, next_chunk = 0, updated_at = now() WHERE episode_id = $1 AND target_lang = $2 AND state = 'failed'", [b.episodeId, b.lang]);
  return c.body(null, 204);
});
