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
import {
  addTranslationShow, groqUsageTodayAll, listTranslationShows, removeTranslationShow, requeueFailedTranslationJob,
  translationQueueRows, utcDayRows,
} from '../../db/repos/safety/translation.ts';

export const modTranslation = new Hono<AdminEnv>();

const feedOf = (raw: string): string => {
  let url: string;
  try { url = decodeURIComponent(raw); } catch { throw new ApiError('validation', 'Send the feed URL encoded.', { fields: ['feedUrl'] }); }
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2048) throw new ApiError('validation', 'That is not a feed URL.', { fields: ['feedUrl'] });
  return url;
};

modTranslation.get('/translation-shows', adminOnly, async (c) => {
  const rows = await listTranslationShows(c.get('db'));
  return c.json({ items: rows.map((r) => ({ feedUrl: r.feed_url, title: r.title, createdAt: new Date(r.created_at).toISOString() })) });
});

modTranslation.put('/translation-shows/:feedUrl', adminOnly, async (c) => {
  await addTranslationShow(c.get('db'), feedOf(c.req.param('feedUrl')), c.get('listener')!.id);
  return c.body(null, 204);
});

modTranslation.delete('/translation-shows/:feedUrl', adminOnly, async (c) => {
  await removeTranslationShow(c.get('db'), feedOf(c.req.param('feedUrl')));
  return c.body(null, 204);
});

modTranslation.get('/translation-usage', adminOnly, async (c) => {
  const db = c.get('db');
  const [d] = await utcDayRows(db);
  const used = await groqUsageTodayAll(db);
  const models = [WHISPER, TRANSLATOR].map((model) => {
    const u = used.find((r) => r.model === model);
    const l = GROQ_LIMITS[model as keyof typeof GROQ_LIMITS];
    return {
      model, requests: Number(u?.requests ?? 0), audioS: Number(u?.audio_s ?? 0), tokens: Number(u?.tokens ?? 0),
      budget: { requests: budgetOf(l.rpd), ...(l.audioSPerDay ? { audioS: budgetOf(l.audioSPerDay) } : {}), ...(l.tpd ? { tokens: budgetOf(l.tpd) } : {}) },
    };
  });
  const queue = await translationQueueRows(db);
  return c.json({
    day: d?.day ?? '', models,
    queue: queue.map((q) => ({ episodeId: q.episode_id, lang: q.target_lang, state: q.state, title: q.title, error: q.error, requestedAt: new Date(q.requested_at).toISOString() })),
  });
});

modTranslation.post('/translation-jobs/retry', adminOnly, json(z.object({ episodeId: z.string().min(1).max(200), lang: z.enum(['en', 'zh-Hans']) })), async (c) => {
  const b = c.req.valid('json');
  await requeueFailedTranslationJob(c.get('db'), b.episodeId, b.lang);
  return c.body(null, 204);
});
