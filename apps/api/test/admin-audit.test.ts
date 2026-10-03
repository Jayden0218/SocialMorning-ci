/**
 * M15 guards G-A2…G-A5 (FR-004, SC-003, edge case "stolen session").
 *
 * The breaks that turn each red (watched once, named in the commit):
 *   G-A2 (one record row per write): in `src/routes/admin/` `PUT /discover`, call
 *        `putDiscoverSettings(db, …)` directly instead of through `adminWrite`.
 *   G-A3 (append-only): delete the `CREATE TRIGGER admin_audit_append_only …` statement from
 *        `src/db/migrations/014_admin.sql`.
 *   G-A4 (objects, not strings): in `insertAudit` (`src/auth/admin.ts`) store `to_jsonb($6::text)`
 *        instead of `($6::text)::jsonb` — the value becomes a JSON string (and the column CHECK
 *        refuses it, so the write fails: red either way).
 *   G-A5 (12 h since CREATED): in `adminOnly` read `last_seen_at` instead of `created_at`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup, auditRows } from './admin-harness.ts';

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
  const [full] = await t.q<{ before: { version: number }; after: { version: number; hidden: string[] }; device: string }>('SELECT before, after, device FROM admin_audit');
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

test('G-A3: the record cannot be changed or deleted, even directly in SQL', async () => {
  const { t, owner } = await adminSetup();
  await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS);
  await assert.rejects(t.q("UPDATE admin_audit SET action = 'nothing happened'"), /append-only/);
  await assert.rejects(t.q('DELETE FROM admin_audit'), /append-only/);
  assert.equal((await auditRows(t)).length, 1);
  await t.close();
});

test('G-A4: before/after are stored as jsonb OBJECTS, never JSON strings (the M14 lesson)', async () => {
  const { t, owner } = await adminSetup();
  await aCall(t, 'PUT', '/v1/admin/discover', owner, SETTINGS);
  const [r] = await auditRows(t);
  assert.equal(r!.before_type, 'object');
  assert.equal(r!.after_type, 'object');
  // And the column itself refuses a string, whoever writes it.
  await assert.rejects(t.q(
    `INSERT INTO admin_audit (admin_id, area, action, target, after) VALUES ($1, 'discover', 'x', 'x', to_jsonb('{"a":1}'::text))`, [owner.id]), /check/i);
  await t.close();
});

test('G-A5: an admin session 13 h after it was CREATED is refused with reauth, however recently it was used; 11 h is fine', async () => {
  const { t, owner } = await adminSetup();
  await t.q("UPDATE sessions SET created_at = now() - interval '11 hours', last_seen_at = now() WHERE device_label = 'studio-web' AND listener_id = $1", [owner.id]);
  assert.equal((await aCall(t, 'GET', '/v1/admin/audit', owner)).status, 200);
  await t.q("UPDATE sessions SET created_at = now() - interval '13 hours', last_seen_at = now() WHERE device_label = 'studio-web' AND listener_id = $1", [owner.id]);
  const late = await aCall(t, 'GET', '/v1/admin/audit', owner);
  assert.equal(late.status, 401);
  assert.equal(((await late.json()) as { error: string }).error, 'reauth');
  // The rest of the Studio still works on that session (idle rule only) — Admin alone asks again.
  assert.equal((await aCall(t, 'GET', '/v1/studio/me', owner)).status, 200);
  await t.close();
});
