// M25 G6: what the LOCAL test server holds after the iOS journey (which does not run the comment
// flow — apps/mobile/.maestro/flows.txt says why). The Android journey uses the fuller
// `apps/api/scripts/journey.ts phone`, which also checks the comment.
//   node scripts/journey-check.mjs <email>     (E2E_API, JOURNEY_OUT)
import { readFileSync } from 'node:fs';

const API = (process.env.E2E_API ?? 'http://localhost:8787').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(API)) throw new Error(`${API} is not a local test server`);
const email = process.argv[2] ?? 'listener-02@journey.test';
const j = JSON.parse(readFileSync(process.env.JOURNEY_OUT ?? 'apps/api/journey.json', 'utf8'));
const ep = j.episodes[0];
let n = 0;
const ok = (cond, what) => { n++; if (!cond) { console.error(`  ✗ ${n}. ${what}`); process.exit(1); } console.log(`  ✓ ${n}. ${what}`); };
const call = async (method, path, body, token) => {
  const res = await fetch(API + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, json: await res.json().catch(() => undefined) };
};
const signIn = await call('POST', '/v1/auth/sign-in', { email, password: 'e2e-correct-horse' });
ok(signIn.status === 200, `${email} signs in (${signIn.status})`);
const token = signIn.json.token;
const subs = await call('GET', '/v1/me/subscriptions', undefined, token);
ok(subs.json.items.some((i) => i.feedUrl === j.show.feedUrl && !i.deletedAt), 'the phone subscribed to the show');
const pos = (await call('GET', '/v1/me/positions', undefined, token)).json.positions.find((p) => p.episodeId === ep.episodeId);
ok(pos !== undefined && pos.offsetMs >= 15_000 && pos.offsetMs < 30_000, `the phone's position reached the server, 0:15–0:29 (${pos?.offsetMs} ms)`);
console.log(`journey check done: ${n} checks`);
