// Admin routes for For You (boost, bury, never recommend; the ranking weights) and the inbox moved from /mod (feedback, search requests, rec numbers).
/**
 * M25 lane AL — owner only, behind `adminOnly`.
 *
 * A6 — For You:
 *   GET    /foryou                → { rules, weights, version, saved, defaults, bounds, boost, bury }
 *   PUT    /foryou/rules          { feedUrl, rule: boost|bury|never, note? } → { rules }
 *   DELETE /foryou/rules?feedUrl= → { rules }
 *   PUT    /foryou/weights        { version, weights: {affinity,…} | null (reset) } → { weights, version, saved }
 * Every save drops the cached For You lists (`dropForYouCache`), so the next one is rebuilt with it.
 *
 * A9 — the read-only `/mod` pages, now in Admin as JSON (the `/mod` HTML pages stay as they were):
 *   GET /recs                     → { days: 7, channels: ChannelRollup[], similarityAge, similarityStale }   (= /mod/recs)
 *   GET /feedback                 → { items }   (= /mod/feedback, newest 50)
 *   GET /feedback/:id/:n          → the image (n = 1…3)
 *   GET /search-requests          → { items: { q, n, last }[] }   (= /mod/search-requests)
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { DEFAULT_WEIGHTS, RULE_BOOST, RULE_BURY, WEIGHT_BOUNDS, WEIGHT_KEYS } from '@socialmorning/social-core';
import { adminWrite, auditCtx, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { deleteRule, dropForYouCache, getWeights, listRules, putRule, putWeights, RULES } from '../../db/repos/discover/foryou-rules.ts';
import { rollup } from '../../db/repos/library/rec-events.ts';
import { similarityAgeHours, SIMILARITY_STALE_HOURS } from '../../db/repos/discover/similarity.ts';
import { feedbackImage, recentFeedback } from '../../db/repos/account/feedback.ts';
import { recentSearchRequests } from '../discover/search-requests.ts';
import { feedUrl, version } from './common.ts';

export function registerForYou(admin: Hono<AdminEnv>): void {
  const weightShape = z.object(Object.fromEntries(WEIGHT_KEYS.map((k) => [k, z.number().min(WEIGHT_BOUNDS[k][0]).max(WEIGHT_BOUNDS[k][1])])) as Record<(typeof WEIGHT_KEYS)[number], z.ZodNumber>);

  admin.get('/foryou', async (c) => {
    const db = c.get('db');
    const [rules, w] = await Promise.all([listRules(db), getWeights(db)]);
    return c.json({ rules, ...w, defaults: DEFAULT_WEIGHTS, bounds: WEIGHT_BOUNDS, boost: RULE_BOOST, bury: RULE_BURY });
  });

  admin.put('/foryou/rules', json(z.object({ feedUrl, rule: z.enum(RULES), note: z.string().trim().max(500).nullable().optional() })), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    await adminWrite(db, auditCtx(c), { area: 'discover', action: `for you ${b.rule}`, target: b.feedUrl },
      async (tx) => ({ rules: await listRules(tx) }), (tx) => putRule(tx, b.feedUrl, b.rule, b.note || null, c.get('listener')!.id));
    await dropForYouCache(db);
    return c.json({ rules: await listRules(db) });
  });

  admin.delete('/foryou/rules', async (c) => {
    const url = feedUrl.safeParse(c.req.query('feedUrl'));
    if (!url.success) throw new ApiError('validation', 'feedUrl must be a feed address.', { fields: ['feedUrl'] });
    const db = c.get('db');
    const ok = await adminWrite(db, auditCtx(c), { area: 'discover', action: 'for you rule removed', target: url.data },
      async (tx) => ({ rules: await listRules(tx) }), (tx) => deleteRule(tx, url.data));
    if (!ok) throw new ApiError('not_found', 'No rule for that show.');
    await dropForYouCache(db);
    return c.json({ rules: await listRules(db) });
  });

  admin.put('/foryou/weights', json(z.object({ version, weights: weightShape.nullable() })), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    await adminWrite(db, auditCtx(c), { area: 'discover', action: b.weights ? 'for you weights' : 'for you weights reset', target: 'foryou' },
      (tx) => getWeights(tx), (tx) => putWeights(tx, b.version, b.weights));
    await dropForYouCache(db);
    return c.json(await getWeights(db));
  });

  // ---- A9: /mod's read-only pages, as Admin JSON ----

  admin.get('/recs', async (c) => {
    const db = c.get('db');
    const [channels, age] = await Promise.all([rollup(db, 7), similarityAgeHours(db)]);
    return c.json({ days: 7, channels, similarityAge: age, similarityStale: age === null || age > SIMILARITY_STALE_HOURS });
  });

  admin.get('/feedback', async (c) => {
    const rows = await recentFeedback(c.get('db'));
    return c.json({ items: rows.map((r) => ({ id: r.id, kind: r.kind, body: r.body, appVersion: r.app_version, createdAt: new Date(r.created_at).toISOString(), displayName: r.display_name, images: Number(r.images) })) });
  });

  admin.get('/feedback/:id/:n', async (c) => {
    const n = Number(c.req.param('n'));
    if (!Number.isInteger(n) || n < 1 || n > 3) throw new ApiError('not_found', 'No such image.');
    const img = await feedbackImage(c.get('db'), c.req.param('id'), n).catch(() => undefined);
    if (!img) throw new ApiError('not_found', 'No such image.');
    c.header('content-type', img.mime);
    return c.body(img.bytes as unknown as ArrayBuffer);
  });

  admin.get('/search-requests', async (c) => c.json({ items: await recentSearchRequests(c.get('db')) }));
}
