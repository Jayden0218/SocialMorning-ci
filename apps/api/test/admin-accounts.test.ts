/**
 * M15 guard G-C2 (FR-021) and the account rules (FR-019, FR-020, FR-023).
 *
 * The break that turns G-C2 red (watched once, named in the commit): in `src/routes/studio.ts`,
 * the "act as" record middleware, pass `adminId: c.get('listener')!.id` (record only the account
 * acted as) instead of `adminId: admin.id`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup, auditRows, FX } from './admin-harness.ts';
import { sCall, type StudioUser } from './studio-harness.ts';

type Result = { ok: true; id: string } | { ok: false; reason: string };

test('bulk create: results in input order; a duplicate email in the list and a taken email are refused, the rest are made', async () => {
  const { t, owner } = await adminSetup();
  const res = await aCall(t, 'POST', '/v1/admin/accounts', owner, { accounts: [
    { displayName: 'Mei Ling', bio: 'Shares good shows.' },
    { displayName: 'Arif', email: 'arif@example.com' },
    { displayName: 'Arif again', email: 'ARIF@example.com' },
    { displayName: 'Taken', email: 'other@example.com' },
  ] });
  assert.equal(res.status, 200, await res.clone().text());
  const { results } = (await res.json()) as { results: Result[] };
  assert.deepEqual(results.map((r) => r.ok), [true, true, false, false]);
  assert.match((results[2] as { reason: string }).reason, /twice/);
  assert.match((results[3] as { reason: string }).reason, /exists/);
  const made = await t.q<{ email: string; bio: string | null; made_by: string }>("SELECT email, bio, made_by FROM listeners WHERE made_by IS NOT NULL ORDER BY created_at, email");
  assert.equal(made.length, 2);
  assert.ok(made.every((m) => m.made_by === owner.id));
  assert.ok(made.some((m) => /^acct-[0-9a-f-]{36}@accounts\.invalid$/.test(m.email) && m.bio === 'Shares good shows.'), 'no email → a reserved .invalid address');
  assert.deepEqual((await auditRows(t)).map((r) => [r.area, r.action]), [['accounts', 'create']]);
  // Over 50 rows, or a bio over 160, is refused whole.
  assert.equal((await aCall(t, 'POST', '/v1/admin/accounts', owner, { accounts: Array.from({ length: 51 }, (_, i) => ({ displayName: `N${i}` })) })).status, 422);
  assert.equal((await aCall(t, 'POST', '/v1/admin/accounts', owner, { accounts: [{ displayName: 'B', bio: 'x'.repeat(161) }] })).status, 422);
  await t.close();
});

test('G-C2: a Studio write while acting is made AS the account and recorded with BOTH the admin and the account', async () => {
  const { t, owner, other } = await adminSetup();
  const { results } = (await (await aCall(t, 'POST', '/v1/admin/accounts', owner, { accounts: [{ displayName: 'Curator Cai' }] })).json()) as { results: Result[] };
  const acctId = (results[0] as { id: string }).id;

  // Only accounts made in Admin can be acted as.
  assert.equal((await aCall(t, 'POST', `/v1/admin/act-as/${other.id}`, owner)).status, 404);

  const start = await aCall(t, 'POST', `/v1/admin/act-as/${acctId}`, owner);
  assert.equal(start.status, 200);
  const setCookie = start.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /^sm_studio_as=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const asCookie = setCookie.split(';')[0]!;
  const acting: StudioUser = { id: acctId, token: '', cookie: `${owner.cookie}; ${asCookie}` };

  const me = (await (await sCall(t, 'GET', '/v1/studio/me', acting)).json()) as { me: { id: string }; isAdmin: boolean; actingAs: { id: string; displayName: string } | null };
  assert.equal(me.me.id, acctId);
  assert.deepEqual(me.actingAs, { id: acctId, displayName: 'Curator Cai' });
  assert.equal(me.isAdmin, true, 'the admin behind the session is still admin');

  const made = await sCall(t, 'POST', '/v1/studio/hosted-shows', acting, { title: 'Made while acting' });
  assert.equal(made.status, 201, await made.clone().text());
  const [show] = await t.q<{ owner_id: string }>("SELECT owner_id FROM hosted_shows WHERE title = 'Made while acting'");
  assert.equal(show!.owner_id, acctId, 'the write was made as the account');
  const studioRows = (await auditRows(t)).filter((r) => r.action.startsWith('studio '));
  assert.equal(studioRows.length, 1);
  assert.equal(studioRows[0]!.admin_id, owner.id, 'the record names the admin who acted');
  assert.equal(studioRows[0]!.acting_as, acctId, 'and the account acted as');

  // The act-as cookie alone, or beside someone else's session, is not a session.
  assert.equal((await t.call('GET', '/v1/studio/me', undefined, undefined, { cookie: asCookie })).status, 401);
  const otherWith = (await (await sCall(t, 'GET', '/v1/studio/me', { ...other, cookie: `${other.cookie}; ${asCookie}` })).json()) as { me: { id: string } };
  assert.equal(otherWith.me.id, other.id);
  // Acting as a suspended account is allowed (to fix it).
  await t.q('UPDATE listeners SET suspended_at = now() WHERE id = $1', [acctId]);
  assert.equal((await sCall(t, 'GET', '/v1/studio/me', acting)).status, 200);

  // Switch back: the acting session is gone; the owner is the owner again.
  assert.equal((await sCall(t, 'POST', '/v1/admin/act-as/stop', acting)).status, 200);
  assert.equal((await t.q('SELECT 1 FROM sessions WHERE acting_admin_id IS NOT NULL')).length, 0);
  assert.equal(((await (await sCall(t, 'GET', '/v1/studio/me', acting)).json()) as { me: { id: string } }).me.id, owner.id);
  await t.close();
});

test('curator (D3): set on an external show, the app reads it as `curator`, never as a host; removing it clears it', async () => {
  const { t, owner } = await adminSetup();
  const { results } = (await (await aCall(t, 'POST', '/v1/admin/accounts', owner, { accounts: [{ displayName: 'Shara' }] })).json()) as { results: Result[] };
  const id = (results[0] as { id: string }).id;
  const set = await aCall(t, 'PUT', '/v1/admin/curators', owner, { feedUrl: FX, listenerId: id });
  assert.equal(set.status, 200);
  assert.deepEqual(await set.json(), { curator: { id, displayName: 'Shara' } });
  const extras = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FX)}`)).json()) as { curator: unknown; hostAccounts: unknown[] };
  assert.deepEqual(extras.curator, { id, displayName: 'Shara' });
  assert.deepEqual(extras.hostAccounts, [], 'a curator is not a host');
  assert.equal((await aCall(t, 'PUT', '/v1/admin/curators', owner, { feedUrl: FX, listenerId: null })).status, 200);
  assert.equal(((await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FX)}`)).json()) as { curator: unknown }).curator, null);
  assert.deepEqual((await auditRows(t)).map((r) => r.action), ['create', 'set_curator', 'remove_curator']);
  await t.close();
});

test('edit an admin-made account (name, bio, email); a taken email is refused; a real listener is not editable here', async () => {
  const { t, owner, other } = await adminSetup();
  const { results } = (await (await aCall(t, 'POST', '/v1/admin/accounts', owner, { accounts: [{ displayName: 'Old' }] })).json()) as { results: Result[] };
  const id = (results[0] as { id: string }).id;
  const ok = await aCall(t, 'PATCH', `/v1/admin/accounts/${id}`, owner, { displayName: 'New', bio: 'Hello', email: 'new@example.com' });
  assert.equal(ok.status, 200);
  const { account } = (await ok.json()) as { account: { displayName: string; bio: string; email: string; placeholderEmail: boolean } };
  assert.deepEqual([account.displayName, account.bio, account.email, account.placeholderEmail], ['New', 'Hello', 'new@example.com', false]);
  assert.equal((await aCall(t, 'PATCH', `/v1/admin/accounts/${id}`, owner, { email: 'other@example.com' })).status, 409);
  assert.equal((await aCall(t, 'PATCH', `/v1/admin/accounts/${other.id}`, owner, { displayName: 'Hijack' })).status, 404);
  await t.close();
});
