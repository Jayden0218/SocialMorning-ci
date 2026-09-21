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
import { clipById, episodeClips } from './routes/clips.ts';
import { createClipPages } from './pages/clip.ts';
import { follows } from './routes/follows.ts';
import { feed } from './routes/feed.ts';
import { listened } from './routes/listened.ts';
import { privacy, profiles } from './routes/profiles.ts';

export type AppDeps = { db: Db; pepper: string; assetLinksSha256?: string };

/**
 * The one Hono app. `src/server.ts` serves it locally; `api/index.ts` is the Vercel entry.
 * Every error leaves as `{ error, message }` (contracts/api.md); zod failures become 422.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AuthEnv>();

  app.use('*', requestId());
  app.use('*', bodyLimit({ maxSize: 16 * 1024 }));
  app.use('*', async (c, next) => {
    c.set('db', deps.db);
    c.set('pepper', deps.pepper);
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
  app.route('/v1/auth', auth);
  app.route('/v1/me', me);
  app.route('/v1/me/positions', positions);
  app.route('/v1/me/feed', feed);
  app.route('/v1/me/listened', listened);
  app.route('/v1/me/privacy', privacy);
  app.route('/v1/listeners', follows);
  app.route('/v1/listeners', profiles);
  app.route('/v1/episodes', episodes);
  app.route('/v1/episodes', comments);
  app.route('/v1/episodes', social);
  app.route('/v1/episodes', reactions);
  app.route('/v1/comments', commentById);
  app.route('/v1/episodes', episodeClips);
  app.route('/v1/clips', clipById);
  app.route('/', createClipPages({ ...(deps.assetLinksSha256 !== undefined ? { assetLinksSha256: deps.assetLinksSha256 } : {}) }));

  return app;
}

