// Tests that each admin write leaves one unchangeable record; old sessions are refused.
/**
 * M15 guards G-A2…G-A5 (FR-004, SC-003, edge case "stolen session").
 *
 * The breaks that turn each red (watched once, named in the commit):
 *   G-A2 (one record row per write): in `src/routes/admin/` `PUT /discover`, call
 *        `putDiscoverSettings(db, …)` directly instead of through `adminWrite`.
 *   G-A3 (append-only): in `src/db/ddb/store.ts` `createStore`, drop the `assertAppendOnly(command)` call.
 *   G-A4 (objects, not strings): in `src/db/repos/safety/ddb/admin-access.ts` store `JSON.stringify(asObject(after))`
 *        instead of `asObject(after)` — the value becomes a JSON string.
 *   G-A5 (12 h since CREATED): in `adminOnly` read `last_seen_at` instead of `created_at`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup, auditRows } from './admin-harness.ts';
import { ageStudioSessions, auditFull, tamperWithAudit } from './sf-neutral.ts';

const SETTINGS = { version: 0, order: ['picks', 'forYou'], hidden: ['said'], pins: [], hides: [] };

test('G-A2: one admin write → exactly one record row, with before and after; Activity lists it newest first', async () => {
  const { t, owner } = await adminSetup();
  const res = await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS, { 'user-agent': 'TestBrowser/1' });
  assert.equal(res.status, 200, await res.clone().text());
  const rows = await auditRows(t);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.admin_id, owner.id);
  assert.equal(rows[0]!.acting_as, null);
  assert.equal(rows[0]!.area, 'discover');
  const [full] = (await auditFull(t)) as unknown as { before: { version: number }; after: { version: number; hidden: string[] }; device: string }[];
  assert.equal(full!.before.version, 0);
  assert.equal(full!.after.version, 1);
  assert.deepEqual(full!.after.hidden, ['said']);
  assert.equal(full!.device, 'TestBrowser/1', 'the record shows the device');

  // A second write → a second row; a refused write (stale version) → no row.
  await aCall(t, 'PUT', '/v1/admin/discover', owner, { ...SETTINGS, version: 1, hidden: [] });
  assert.equal((await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS)).status, 409);
  assert.equal((await auditRows(t)).length, 2, 'a refused write rolled back and left no record');

  const page = (await (await aCall(t, 'GET', '/v1/admin/audit?area=discover', owner)).json()) as { items: { id: string; area: string; adminName: string; before: unknown; after: unknown }[] };
  assert.equal(page.items.length, 2);
  assert.ok(Number(page.items[0]!.id) > Number(page.items[1]!.id), 'newest first');
  assert.equal(page.items[0]!.adminName, 'Owner');
  assert.equal(typeof page.items[0]!.after, 'object');
  const other = (await (await aCall(t, 'GET', '/v1/admin/audit?area=picks', owner)).json()) as { items: unknown[] };
  assert.equal(other.items.length, 0, 'the area filter filters');
  await t.close();
});

test('G-A3: the record cannot be changed or deleted, even directly through the Store', async () => {
  const { t, owner } = await adminSetup();
  await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS);
  const tamper = await tamperWithAudit(t);
  await assert.rejects(tamper.update, /append-only/);
  await assert.rejects(tamper.remove, /append-only/);
  assert.equal((await auditRows(t)).length, 1);
  await t.close();
});

test('G-A4: before/after are stored as OBJECTS, never JSON strings (the M14 lesson)', async () => {
  const { t, owner } = await adminSetup();
  await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS);
  const [r] = await auditRows(t);
  assert.equal(r!.before_type, 'object');
  assert.equal(r!.after_type, 'object');
  await t.close();
});

test('G-A5: an admin session 13 h after it was CREATED is refused with reauth, however recently it was used; 11 h is fine', async () => {
  const { t, owner } = await adminSetup();
  await ageStudioSessions(t, owner.id, 11 * 3_600_000);
  assert.equal((await aCall(t, 'GET', '/v1/admin/audit', owner)).status, 200);
  await ageStudioSessions(t, owner.id, 13 * 3_600_000);
  const late = await aCall(t, 'GET', '/v1/admin/audit', owner);
  assert.equal(late.status, 401);
  assert.equal(((await late.json()) as { error: string }).error, 'reauth');
  // The rest of the Studio still works on that session (idle rule only) — Admin alone asks again.
  assert.equal((await aCall(t, 'GET', '/v1/studio/me', owner)).status, 200);
  await t.close();
});

// M28 US9 (research R13): an audit record expires 2 years after it was made.
// Break (watched red): in `auditItem` (src/auth/admin-tx.ts) drop the `{ ttl: auditTtl(at) }` argument.
test('G-M28-AUD-TTL: a new audit record carries ttl = createdAt + 730 days (epoch seconds), and so does its sibling', async () => {
  const { acScan } = await import('./fixtures.ts');
  const { AUDIT_KEEP_DAYS } = await import('../src/db/repos/safety/ddb/admin-audit.ts');
  assert.equal(AUDIT_KEEP_DAYS, 730);
  const { t, owner } = await adminSetup();
  assert.equal((await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS)).status, 200);
  const items = await acScan(t.store, 'main', 'audit');
  assert.ok(items.length >= 1, 'the write left a record');
  for (const i of items) {
    const created = Date.parse(String(i['createdAt']));
    assert.ok(Number.isFinite(created), `${String(i['SK'])} has createdAt`);
    assert.equal(typeof i['ttl'], 'number', `${String(i['SK'])} carries a numeric ttl`);
    assert.equal(i['ttl'], Math.floor((created + 730 * 86_400_000) / 1000), `${String(i['SK'])}: ttl is createdAt + 730 days in epoch SECONDS`);
  }
  await t.close();
});
