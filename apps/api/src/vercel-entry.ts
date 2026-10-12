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
import { depsFromEnv } from './config.ts';

// Top-level await: the bundle is ESM (build script), Vercel's Node 22 runtime supports it.
const app = createApp(await depsFromEnv());
const handler = (req: Request): Promise<Response> => Promise.resolve(app.fetch(req));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
