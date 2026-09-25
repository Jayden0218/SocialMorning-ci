import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import type { Db } from './db/db.ts';
import type { AuthEnv } from './auth/session.ts';
import { ApiError } from './errors.ts';
import { auth } from './routes/auth.ts';
import { me } from './routes/me.ts';
import { episodes } from './routes/episodes.ts';
import { comments, commentById } from './routes/comments.ts';
import { social } from './routes/social.ts';
import { reactions } from './routes/reactions.ts';
import { positions } from './routes/positions.ts';
import { subscriptions } from './routes/subscriptions.ts';
import { clipById, episodeClips } from './routes/clips.ts';
import { createClipPages } from './pages/clip.ts';
import { mod } from './pages/mod.ts';
import { legal } from './pages/legal.ts';
import { hidden, reports } from './routes/reports.ts';
import { blocks } from './routes/blocks.ts';
import { follows } from './routes/follows.ts';
import { feed } from './routes/feed.ts';
import { listened } from './routes/listened.ts';
import { privacy, profiles } from './routes/profiles.ts';
import { discover } from './routes/discover.ts';
import { createSearchRoute } from './routes/search.ts';
import { nextup } from './routes/nextup.ts';
import { foryou } from './routes/foryou.ts';
import { createInternalRoute } from './routes/internal.ts';
import { validatePicks } from '@socialmorning/social-core';
import type { Catalog, Safety } from './auth/session.ts';
import picksJson from '../picks.json' with { type: 'json' };

export type AppDeps = {
  db: Db; pepper: string; assetLinksSha256?: string;
  /** M5: the catalogue's fetch (tests inject a fake Apple) and the raw picks file; defaults: global fetch, `picks.json`. */
  catalogFetch?: typeof fetch;
  picksRaw?: unknown;
  today?: () => string;
  /** M6: the one moderator and the appeals address. Missing → `/mod` answers 503 and the message names no address (degrade, never crash). */
  ownerListenerId?: string;
  appealsEmail?: string;
  /** M6: the published build's SHA-256 shown on `/get` (env RELEASE_SHA256). */
  releaseSha256?: string;
  /** M8: the scheduled rebuild's bearer token (env JOB_TOKEN). Unset → /v1/internal is closed. */
  jobToken?: string;
};

/**
 * The one Hono app. `src/server.ts` serves it locally; `api/index.ts` is the Vercel entry.
 * Every error leaves as `{ error, message }` (contracts/api.md); zod failures become 422.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AuthEnv>();

  app.use('*', requestId());
  app.use('*', bodyLimit({ maxSize: 16 * 1024 }));
  // M5: the picks file is validated once; every bad entry is a warning, never a crash (G1).
  const { picks, warnings } = validatePicks(deps.picksRaw ?? picksJson);
  for (const w of warnings) console.warn(`[picks] ${w}`);
  const catalog: Catalog = { fetch: deps.catalogFetch ?? fetch, picks, today: deps.today ?? (() => new Date().toISOString().slice(0, 10)) };

  if (!deps.ownerListenerId || !deps.appealsEmail) console.warn('[safety] OWNER_LISTENER_ID / APPEALS_EMAIL not set: /mod is off, messages name no address');
  const safety: Safety = { ownerListenerId: deps.ownerListenerId, appealsEmail: deps.appealsEmail, releaseSha256: deps.releaseSha256 };

  app.use('*', async (c, next) => {
    c.set('db', deps.db);
    c.set('pepper', deps.pepper);
    c.set('catalog', catalog);
    c.set('safety', safety);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(err.body(), err.status as 422);
    if (err instanceof Error && /reply_depth/.test(err.message)) {
      return c.json(new ApiError('reply_depth', 'You can reply to a comment, not to a reply.').body(), 422);
    }
    console.error(c.get('requestId'), err);
    return c.json({ error: 'internal', message: 'Something went wrong on our side.' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not_found', message: 'No such route.' }, 404));

  app.get('/v1/health', (c) => c.json({ ok: true }));
  // M6 (FR-027): the appeals address the app shows — never hard-coded in a build.
  app.get('/v1/meta', (c) => c.json({ ...(safety.appealsEmail ? { appealsEmail: safety.appealsEmail } : {}) }));
  app.route('/v1/auth', auth);
  app.route('/v1/me', me);
  app.route('/v1/me/positions', positions);
  app.route('/v1/me/subscriptions', subscriptions);
  app.route('/v1/me/feed', feed);
  app.route('/v1/me/listened', listened);
  app.route('/v1/me/privacy', privacy);
  app.route('/v1/me/blocks', blocks);
  app.route('/v1/me/hidden', hidden);
  app.route('/v1/reports', reports);
  app.route('/v1/listeners', follows);
  app.route('/v1/listeners', profiles);
  app.route('/v1/discover', discover);
  app.route('/v1/for-you', foryou);
  app.route('/v1/internal', createInternalRoute(deps.jobToken));
  app.route('/v1/search', createSearchRoute());
  app.route('/v1/episodes', nextup);
  app.route('/v1/episodes', episodes);
  app.route('/v1/episodes', comments);
  app.route('/v1/episodes', social);
  app.route('/v1/episodes', reactions);
  app.route('/v1/comments', commentById);
  app.route('/v1/episodes', episodeClips);
  app.route('/v1/clips', clipById);
  app.route('/mod', mod);
  app.route('/', legal);
  app.route('/', createClipPages({ ...(deps.assetLinksSha256 !== undefined ? { assetLinksSha256: deps.assetLinksSha256 } : {}) }));

  return app;
}

