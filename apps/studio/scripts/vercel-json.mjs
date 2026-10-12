// Writes apps/studio/vercel.json from vercel.base.json and STUDIO_API_ORIGIN (the API the Studio proxies /api to).
/**
 * M27 US4 (FR-035, research R10). A `vercel.json` rewrite destination is a literal: Vercel does not substitute environment variables in
 * it (Vercel Community threads, read 2026-10-12: https://community.vercel.com/t/is-there-any-way-to-use-env-in-vercel-json/1146 and
 * https://community.vercel.com/t/configurable-rewrites/5305). So the staging Studio project runs this before `vercel deploy`.
 *
 *   node scripts/vercel-json.mjs            → writes vercel.json for STUDIO_API_ORIGIN (default https://socialmorning-api.vercel.app)
 *   node scripts/vercel-json.mjs --stdout   → prints it instead (the test compares it with the committed file)
 * The committed vercel.json IS the prod output: test/vercel-json.test.ts keeps the two identical, byte for byte.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ORIGIN = 'https://socialmorning-api.vercel.app';
const HERE = new URL('..', import.meta.url);

export function render(origin = process.env.STUDIO_API_ORIGIN || DEFAULT_ORIGIN) {
  if (!/^https:\/\/[^\s/]+$/.test(origin)) throw new Error(`STUDIO_API_ORIGIN must be an https origin without a path or trailing slash, got "${origin}"`);
  const base = readFileSync(new URL('vercel.base.json', HERE), 'utf8');
  if (!base.includes('__STUDIO_API_ORIGIN__')) throw new Error('vercel.base.json has no __STUDIO_API_ORIGIN__ placeholder');
  return base.replaceAll('__STUDIO_API_ORIGIN__', origin);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = render();
  if (process.argv.includes('--stdout')) process.stdout.write(text);
  else { writeFileSync(new URL('vercel.json', HERE), text); console.log(`wrote vercel.json (/api -> ${process.env.STUDIO_API_ORIGIN || DEFAULT_ORIGIN})`); }
}
