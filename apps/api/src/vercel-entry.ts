// Entry point that runs the API as a Vercel serverless function.
/**
 * Vercel entry (bundled by `npm run build` into api/index.js — research R1, T017: the
 * builder kept `.ts` import paths, so we bundle ourselves). Same Hono app as src/server.ts.
 *
 * Vercel's Node runtime: a `default` Web handler alone hung (FUNCTION_INVOCATION_TIMEOUT),
 * and a `(req, res)` listener hung on POST because the runtime had already consumed the
 * body (2026-09-21). Named HTTP-method exports are Vercel's documented Web-handler form;
 * each receives a standard `Request` and returns the Hono `Response`.
 *
 * M25 SB — why `GET /` answered 500 FUNCTION_INVOCATION_FAILED while every /v1 path worked: the
 * Vercel project's Framework Preset was "Hono". That preset builds a SECOND function from the Hono
 * entry it finds (`src/app.ts`), compiled with tsc but not bundled, and serves it at `/` before the
 * rewrites are read. That function crashed on import (ERR_MODULE_NOT_FOUND for a `.ts` import —
 * Vercel runtime log, 2026-10-08) and never reached this bundle. `vercel.json` now sets
 * `"framework": null` ("Other"), so `api/index.js` (this file, bundled) is the only function and
 * the `/` rewrite reaches it.
 * Note: Vercel finds `api/index.js` as a function because the CLI uploads the (gitignored) copy
 * left by an old local build; `npm run build` then overwrites it on Vercel. Deploying from a
 * fresh clone without that file would find no function — build it once first (or track a stub).
 */
import { createApp } from './app.ts';
import { gmailMailer } from './mail/mailer.ts';
import { createClient } from './db/client.ts';
import { fromPostgres } from './db/db.ts';

const pepper = process.env.SESSION_PEPPER;
if (!pepper) throw new Error('SESSION_PEPPER is not set in the Vercel project env');

const app = createApp({ db: fromPostgres(createClient()), pepper, ...(process.env['ASSETLINKS_SHA256'] ? { assetLinksSha256: process.env['ASSETLINKS_SHA256'] } : {}),
  ...(process.env['OWNER_LISTENER_ID'] ? { ownerListenerId: process.env['OWNER_LISTENER_ID'] } : {}),
  ...(process.env['APPEALS_EMAIL'] ? { appealsEmail: process.env['APPEALS_EMAIL'] } : {}),
  ...(process.env['RELEASE_SHA256'] ? { releaseSha256: process.env['RELEASE_SHA256'] } : {}),
  ...(process.env['JOB_TOKEN'] ? { jobToken: process.env['JOB_TOKEN'] } : {}),
  // M25 SB: the second pepper during a secret rotation (docs/runbooks/secret-rotation.md).
  ...(process.env['PEPPER_NEXT'] ? { pepperNext: process.env['PEPPER_NEXT'] } : {}),
  ...(process.env['GMAIL_USER'] && process.env['GMAIL_APP_PASSWORD'] ? { mailer: gmailMailer(process.env['GMAIL_USER'], process.env['GMAIL_APP_PASSWORD']) } : {}) });
const handler = (req: Request): Promise<Response> => Promise.resolve(app.fetch(req));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
