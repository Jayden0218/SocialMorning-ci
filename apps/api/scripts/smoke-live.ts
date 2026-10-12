// Checks a running API (a deployed stack or the dev server): health, config and Academy against the phone's contracts, and optionally a demo sign-in.
/**
 * M27 US4 (FR-032). Run by scripts/smoke.sh and by the deploy workflows after the code is uploaded.
 *   tsx scripts/smoke-live.ts <base-url> [--demo]
 * `--demo` signs in as the demo account from DEMO_EMAIL + DEMO_PASSWORD (the values scripts/seed-demo.ts wrote; never printed) and checks the
 * `signIn` and `me` contracts. With `--demo` but no DEMO_EMAIL it says SKIPPED and does not fail (the first deploy happens before the account is seeded).
 * Prints only status codes and contract names. Exit 1 on any failure.
 */
import { CONTRACTS, validate, type ContractName } from '../../../packages/contracts/src/index.ts';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? '').replace(/\/$/, '');
if (!/^https?:\/\/[^\s/]+/.test(base)) { console.error('usage: smoke-live.ts <base-url> [--demo]'); process.exit(2); }

let failed = 0;
const say = (ok: boolean, line: string) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
    return { status: res.status, body: await res.json().catch(() => undefined) };
  } catch { return { status: 0, body: undefined }; }
}
const contract = (name: ContractName, body: unknown) => validate(CONTRACTS[name].schema, body).length === 0;

const health = await call('/v1/health');
say(health.status === 200 && (health.body as { ok?: boolean } | undefined)?.ok === true, `GET /v1/health -> ${health.status}`);

const config = await call('/v1/config');
say(config.status === 200 && contract('config', config.body), `GET /v1/config -> ${config.status} (contract config)`);

const academy = await call('/v1/content/academy');
say(academy.status === 200 && contract('content', academy.body), `GET /v1/content/academy -> ${academy.status} (contract content)`);

if (args.includes('--demo')) {
  const email = process.env['DEMO_EMAIL'];
  const password = process.env['DEMO_PASSWORD'];
  if (!email || !password) console.log('skip demo sign-in: SKIPPED (DEMO_EMAIL / DEMO_PASSWORD not set)');
  else {
    const signIn = await call('/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, deviceLabel: 'smoke' }) });
    say(signIn.status === 200 && contract('signIn', signIn.body), `POST /v1/auth/sign-in (demo) -> ${signIn.status} (contract signIn)`);
    const token = (signIn.body as { token?: string } | undefined)?.token;
    if (token) {
      const me = await call('/v1/me', { headers: { authorization: `Bearer ${token}` } });
      say(me.status === 200 && contract('me', me.body), `GET /v1/me (demo) -> ${me.status} (contract me)`);
      await call('/v1/auth/sign-out', { method: 'POST', headers: { authorization: `Bearer ${token}` } }); // best effort: leave no session behind
    }
  }
}
console.log(failed === 0 ? 'smoke: all checks passed' : `smoke: ${failed} check(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
