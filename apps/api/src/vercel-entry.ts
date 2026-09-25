/**
 * Vercel entry (bundled by `npm run build` into api/index.js — research R1, T017: the
 * builder kept `.ts` import paths, so we bundle ourselves). Same Hono app as src/server.ts.
 *
 * Vercel's Node runtime: a `default` Web handler alone hung (FUNCTION_INVOCATION_TIMEOUT),
 * and a `(req, res)` listener hung on POST because the runtime had already consumed the
 * body (2026-09-21). Named HTTP-method exports are Vercel's documented Web-handler form;
 * each receives a standard `Request` and returns the Hono `Response`.
 */
import { createApp } from './app.ts';
import { createClient } from './db/client.ts';
import { fromPostgres } from './db/db.ts';

const pepper = process.env.SESSION_PEPPER;
if (!pepper) throw new Error('SESSION_PEPPER is not set in the Vercel project env');

const app = createApp({ db: fromPostgres(createClient()), pepper, ...(process.env['ASSETLINKS_SHA256'] ? { assetLinksSha256: process.env['ASSETLINKS_SHA256'] } : {}),
  ...(process.env['OWNER_LISTENER_ID'] ? { ownerListenerId: process.env['OWNER_LISTENER_ID'] } : {}),
  ...(process.env['APPEALS_EMAIL'] ? { appealsEmail: process.env['APPEALS_EMAIL'] } : {}),
  ...(process.env['RELEASE_SHA256'] ? { releaseSha256: process.env['RELEASE_SHA256'] } : {}),
  ...(process.env['JOB_TOKEN'] ? { jobToken: process.env['JOB_TOKEN'] } : {}) });
const handler = (req: Request): Promise<Response> => Promise.resolve(app.fetch(req));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
