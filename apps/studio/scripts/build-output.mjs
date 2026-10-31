// After `vite build`: on dev, qa and staging, turn dist/ into a Vercel Build Output API v3 folder (.vercel/output) whose /api route proxies to STUDIO_API_ORIGIN.
/**
 * M30 (specs/032-m30-four-environments, open question 3). A `vercel.json` rewrite destination is a literal and the file is read from the
 * Git checkout, so on a Git-connected Vercel project nothing run inside the build can change it. The Build Output API can: a build that writes
 * `.vercel/output/config.json` (version 3) + `static/` is deployed as written (https://vercel.com/docs/build-output-api, read 2026-10-27).
 * The routes here are the ones in vercel.base.json — same headers, same SPA fallback — with the /api destination taken from STUDIO_API_ORIGIN.
 *
 *   VITE_APP_ENV unset or "prod" → does nothing (prod keeps the committed vercel.json, byte for byte).
 *   VITE_APP_ENV dev | qa | staging → STUDIO_API_ORIGIN is REQUIRED (a bare https origin), else the build fails.
 *   node scripts/build-output.mjs [--dist dist] [--out .vercel/output]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = new URL('..', import.meta.url);
const ENVS = ['dev', 'qa', 'staging'];

/** The Build Output API config for `origin`, from vercel.base.json's headers and rewrites. */
export function renderConfig(origin) {
  if (!/^https:\/\/[^\s/]+$/.test(origin)) throw new Error(`STUDIO_API_ORIGIN must be an https origin without a path or trailing slash, got "${origin}"`);
  const base = JSON.parse(readFileSync(new URL('vercel.base.json', HERE), 'utf8'));
  const headerRoute = (source) => {
    const h = base.headers.find((x) => x.source === source);
    if (!h) throw new Error(`vercel.base.json has no headers for ${source}`);
    return { src: source, headers: Object.fromEntries(h.headers.map(({ key, value }) => [key, value])), continue: true };
  };
  const api = base.rewrites.find((r) => r.source === '/api/:path*');
  const spa = base.rewrites.find((r) => r.source === '/(.*)');
  if (!api || !spa) throw new Error('vercel.base.json lost its /api or SPA rewrite');
  return {
    version: 3,
    routes: [
      headerRoute('/(.*)'), // CSP etc. on every response, /api included (as today)
      headerRoute('/api/(.*)'),
      { src: '/api/(.*)', dest: `${origin}/$1` }, // before the filesystem phase, so no merged vercel.json rewrite can win
      { handle: 'filesystem' },
      { src: spa.source, dest: spa.destination },
    ],
  };
}

export function run(env, dist, out) {
  const appEnv = env.VITE_APP_ENV || 'prod';
  if (appEnv === 'prod') return 'prod: no Build Output API folder (vercel.json stands)';
  if (!ENVS.includes(appEnv)) throw new Error(`VITE_APP_ENV must be dev, qa, staging or prod, not "${appEnv}"`);
  const origin = env.STUDIO_API_ORIGIN;
  if (!origin) throw new Error(`STUDIO_API_ORIGIN is required when VITE_APP_ENV=${appEnv}: set it on the Vercel project to the matching API address (https://…, no path). Without it this Studio would proxy /api to the wrong API.`);
  const config = renderConfig(origin);
  if (!existsSync(dist)) throw new Error(`${dist} does not exist: run vite build first`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(dist, `${out}/static`, { recursive: true });
  writeFileSync(`${out}/config.json`, `${JSON.stringify(config, null, 2)}\n`);
  return `${appEnv}: wrote ${out} (/api -> ${origin})`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
  try {
    console.log(run(process.env, arg('--dist', fileURLToPath(new URL('dist', HERE))), arg('--out', fileURLToPath(new URL('.vercel/output', HERE)))));
  } catch (e) {
    console.error(`build-output: ${e.message}`);
    process.exit(1);
  }
}
