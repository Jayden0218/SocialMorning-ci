/**
 * M11 — guard G-A1: nobody sees a show's Studio data without a role on it (SC-005).
 * The matrix is read from the router's own route list, so a new `/shows/:show/*` route is
 * covered the day it is added — it cannot skip the wall by being forgotten here.
 *
 * The break that turns it red: in `src/routes/studio.ts`, change the show-scope middleware's
 * path from '/shows/:show/*' to '/shows/:show/overview' (every other route loses the wall).
 * G-A2 (owner-only routes refuse operators): make `ownerOnly` in `src/routes/studio.ts` call `next()`
 * for every role — the operator rows for OWNER_ONLY then go through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studio } from '../src/routes/studio.ts';
import { freshDb } from './harness.ts';
import { addEpisode, proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/mine.xml';
const OTHER = 'https://feeds.example.com/theirs.xml';

/** Owner-only routes, as `METHOD path` — filled as US6/US7 add them. */
const OWNER_ONLY = new Set<string>([
  'GET /shows/:show/overrides', 'PUT /shows/:show/overrides', 'GET /shows/:show/team', 'POST /shows/:show/team',
  'DELETE /shows/:show/team/:listenerId', 'POST /shows/:show/release', 'GET /shows/:show/tips',
]);

const showRoutes = () => {
  const seen = new Set<string>();
  return studio.routes
    .filter((r) => r.method !== 'ALL' && r.path.startsWith('/shows/:show/'))
    .filter((r) => (seen.has(`${r.method} ${r.path}`) ? false : (seen.add(`${r.method} ${r.path}`), true)));
};

test('G-A1: no role → 403 no_role on every show route; owner and operator get through', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const op = await studioLogin(t, 'op@example.com', 'Op');
  const stranger = await studioLogin(t, 's@example.com', 'Stranger');
  await addEpisode(t, FEED, 'e1', 'One', 1_000_000);
  const key = await proveClaim(t, owner.id, FEED);
  await t.q('INSERT INTO show_members (feed_url, listener_id, added_by) VALUES ($1, $2, $3)', [FEED, op.id, owner.id]);

  const routes = showRoutes();
  assert.ok(routes.length >= 2, 'the matrix found the show routes');
  for (const r of routes) {
    const path = '/v1/studio' + r.path.replace(':show', key).replace(/:[a-zA-Z]+/g, 'x');
    const s = await sCall(t, r.method, path, stranger, r.method === 'GET' ? undefined : {});
    assert.equal(s.status, 403, `${r.method} ${r.path} as a stranger`);
    assert.equal(((await s.json()) as { error: string }).error, 'no_role');
    const o = await sCall(t, r.method, path, owner, r.method === 'GET' ? undefined : {});
    assert.notEqual(o.status, 403, `${r.method} ${r.path} as the owner`);
    const p = await sCall(t, r.method, path, op, r.method === 'GET' ? undefined : {});
    if (OWNER_ONLY.has(`${r.method} ${r.path}`)) assert.equal(p.status, 403, `${r.method} ${r.path} as an operator`);
    else assert.notEqual(p.status, 403, `${r.method} ${r.path} as an operator`);
  }
  await t.close();
});

test('another creator\'s show is refused even with a valid key', async () => {
  const t = await freshDb();
  const a = await studioLogin(t, 'a@example.com', 'A');
  const b = await studioLogin(t, 'b@example.com', 'B');
  await proveClaim(t, a.id, FEED);
  const theirs = await proveClaim(t, b.id, OTHER);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${theirs}/overview`, a)).status, 403);
  await t.close();
});

test('/me lists owned and operated shows; an operator loses the show when the claim is revoked', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const op = await studioLogin(t, 'op@example.com', 'Op');
  await addEpisode(t, FEED, 'e1', 'One', 1_000_000);
  const key = await proveClaim(t, owner.id, FEED);
  await t.q('INSERT INTO show_members (feed_url, listener_id, added_by) VALUES ($1, $2, $3)', [FEED, op.id, owner.id]);
  const mine = ((await (await sCall(t, 'GET', '/v1/studio/me', owner)).json()) as { shows: { key: string; role: string; title: string }[] }).shows;
  assert.deepEqual(mine.map((s) => [s.key, s.role, s.title]), [[key, 'owner', 'The Show']]);
  const theirs = ((await (await sCall(t, 'GET', '/v1/studio/me', op)).json()) as { shows: { role: string }[] }).shows;
  assert.deepEqual(theirs.map((s) => s.role), ['operator']);

  await t.q("UPDATE creator_claims SET status = 'revoked' WHERE feed_url = $1", [FEED]);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/overview`, op)).status, 403);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/overview`, owner)).status, 403);
  await t.close();
});
