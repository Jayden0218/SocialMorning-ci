/**
 * M15 guard G-A1 (SC-002): every `/v1/admin/*` route refuses a non-admin — the test ENUMERATES
 * the routes the app registered, so a route added later is covered without editing this file.
 *
 * The break that turns it red (watched once, named in the commit): in `src/routes/admin/`,
 * move one route ABOVE `admin.use('*', adminOnly)` — e.g. put `admin.get('/audit', …)` first.
 * Hono runs handlers in registration order, so that route answers before the middleware.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup } from './admin-harness.ts';
import { sCall } from './studio-harness.ts';

const SAMPLE: Record<string, string> = { day: '2026-10-02', genreId: '1303' };
const fill = (path: string) => path.replace(/:([A-Za-z]+)/g, (_, name: string) => SAMPLE[name] ?? '00000000-0000-4000-8000-000000000000');

test('G-A1: every registered /v1/admin route answers 401 signed out and 403 not_admin to a non-admin, and changes nothing', async () => {
  const { t, owner, other } = await adminSetup();
  const seen = new Set<string>();
  const routes = t.app.routes
    .filter((r) => r.path.startsWith('/v1/admin/') && r.method !== 'ALL')
    .filter((r) => { const k = `${r.method} ${r.path}`; if (seen.has(k)) return false; seen.add(k); return true; });
  assert.ok(routes.length >= 30, `expected the whole admin surface, found ${routes.length} routes`);
  for (const r of routes) {
    const path = fill(r.path);
    const body = r.method === 'GET' ? undefined : {};
    const out = await sCall(t, r.method, path, undefined, body);
    assert.equal(out.status, 401, `${r.method} ${r.path} signed out → ${out.status}`);
    assert.equal(out.headers.get('cache-control'), 'private, no-store', `${r.method} ${r.path} cache-control`);
    const non = await sCall(t, r.method, path, other, body);
    assert.equal(non.status, 403, `${r.method} ${r.path} non-admin → ${non.status}`);
    assert.equal(((await non.json()) as { error: string }).error, 'not_admin', `${r.method} ${r.path}`);
    assert.equal(non.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal((await t.q('SELECT 1 FROM admin_audit')).length, 0, 'a refused call left a record row, so it wrote something');
  assert.equal((await aCall(t, 'GET', '/v1/admin/audit', owner)).status, 200, 'the owner gets in');
  await t.close();
});

test('the Studio says who is admin (display only); a phone token never reaches Admin; writes need X-Studio', async () => {
  const { t, owner, other } = await adminSetup();
  const me = async (who: typeof owner) => (await (await sCall(t, 'GET', '/v1/studio/me', who)).json()) as { isAdmin: boolean; actingAs: unknown };
  const o = await me(owner);
  assert.equal(o.isAdmin, true);
  assert.equal(o.actingAs, null);
  assert.equal((await me(other)).isAdmin, false);
  const phone = await t.call('POST', '/v1/auth/sign-in', { email: 'owner@example.com', password: 'correct horse' });
  const { token } = (await phone.json()) as { token: string };
  assert.equal((await t.call('GET', '/v1/admin/audit', undefined, token)).status, 401, 'a phone session is not a Studio session');
  const forged = await t.call('PUT', '/v1/admin/discover', { version: 0, order: [], hidden: [], pins: [], hides: [] }, undefined, { cookie: owner.cookie });
  assert.equal(forged.status, 403);
  assert.equal(((await forged.json()) as { error: string }).error, 'csrf');
  await t.close();
});

test('FR-002: the owner is seeded as the only admin, and the last admin cannot be removed', async () => {
  const { t, owner } = await adminSetup();
  await aCall(t, 'GET', '/v1/admin/audit', owner);
  assert.deepEqual((await t.q<{ listener_id: string }>('SELECT listener_id FROM admins')).map((r) => r.listener_id), [owner.id]);
  await assert.rejects(t.q('DELETE FROM admins'), /at least one admin/);
  await t.close();
});
