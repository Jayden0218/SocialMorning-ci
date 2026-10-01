/**
 * M15 guards G-P1, G-P2, G-P3 (SC-001, FR-008, FR-009, FR-012) — picks edited in Admin reach
 * `/v1/discover` with no deploy, never leave the section empty, and a stale save is refused.
 *
 * The breaks that turn each red (watched once, named in the commit):
 *   G-P1: in `src/routes/admin.ts` `catalogChanged`, stop deleting the cache rows
 *         (remove `await dropDiscoverCache(db)`) — the hour's cached body keeps the old picks.
 *   G-P2: in `src/catalog/live.ts` `mergeCatalog`, keep only the tables' picks once any admin day
 *         exists: `const picks = rows.pickDays.size > 0 ? rows.picks : file.picks;` — a future admin
 *         day then leaves today with `[]`.
 *   G-P3: in `src/db/repos/admin-picks.ts` `putPickDay`, delete the `current !== version` check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup, auditRows, FX } from './admin-harness.ts';

const TODAY = '2026-09-22';
const FILE = [{ date: '2026-09-20', feedUrl: FX, guid: 'g-old', why: 'From the file.', order: 1 }];
type Body = { date?: string; picks: { why: string; episode: { title: string } }[] };

const discover = async (t: Awaited<ReturnType<typeof adminSetup>>['t']) => (await (await t.call('GET', '/v1/discover')).json()) as Body;

test('G-P1: picks saved for today are in the very next /v1/discover (the cached body is dropped, the key carries the day)', async () => {
  const { t, owner } = await adminSetup({ picksRaw: FILE, today: () => TODAY });
  const before = await discover(t);
  assert.equal(before.date, '2026-09-20', 'the file serves first');
  assert.deepEqual(before.picks.map((p) => p.why), ['From the file.']);
  assert.ok((await t.q("SELECT 1 FROM cache WHERE key = 'discover:v3:2026-09-22'")).length === 1, 'the body is cached under the day');

  const put = await aCall(t, 'PUT', `/v1/admin/picks/${TODAY}`, owner, { version: 0, items: [
    { feedUrl: FX, guid: 'g-new', why: 'Admin first.' },
    { feedUrl: FX, guid: 'g-old', why: 'Admin second.' },
  ] });
  assert.equal(put.status, 200, await put.clone().text());
  assert.deepEqual(await put.json(), { day: TODAY, version: 1, warnings: [] });

  const after = await discover(t);
  assert.equal(after.date, TODAY);
  assert.deepEqual(after.picks.map((p) => [p.episode.title, p.why]), [['Newest', 'Admin first.'], ['Older', 'Admin second.']], 'same order, same quotes, no deploy');
  assert.equal((await auditRows(t)).filter((r) => r.area === 'picks').length, 1);

  // The calendar and the day editor agree.
  const month = (await (await aCall(t, 'GET', '/v1/admin/picks?from=2026-09-01&to=2026-09-30', owner)).json()) as { days: { day: string; count: number; source: string }[] };
  assert.deepEqual(month.days, [{ day: '2026-09-20', count: 1, source: 'file' }, { day: TODAY, count: 2, source: 'admin' }]);
  const day = (await (await aCall(t, 'GET', `/v1/admin/picks/${TODAY}`, owner)).json()) as { version: number; items: { why: string; episode: { title: string } | null }[] };
  assert.equal(day.version, 1);
  assert.deepEqual(day.items.map((i) => [i.why, i.episode?.title]), [['Admin first.', 'Newest'], ['Admin second.', 'Older']]);
  await t.close();
});

test('G-P2: a day with no rows gets the latest EARLIER picks (admin or file), never an empty section', async () => {
  const { t, owner } = await adminSetup({ picksRaw: FILE, today: () => TODAY });
  // Tomorrow is scheduled; today has nothing → still the file's latest earlier day.
  assert.equal((await aCall(t, 'PUT', '/v1/admin/picks/2026-09-23', owner, { version: 0, items: [{ feedUrl: FX, why: 'Tomorrow.' }] })).status, 200);
  const a = await discover(t);
  assert.equal(a.date, '2026-09-20');
  assert.deepEqual(a.picks.map((p) => p.why), ['From the file.'], 'a future admin day must not empty today');
  // An earlier admin day beats the older file day.
  assert.equal((await aCall(t, 'PUT', '/v1/admin/picks/2026-09-21', owner, { version: 0, items: [{ feedUrl: FX, why: 'Yesterday.' }] })).status, 200);
  const b = await discover(t);
  assert.equal(b.date, '2026-09-21');
  assert.deepEqual(b.picks.map((p) => p.why), ['Yesterday.']);
  // Clearing it (0 items deletes the day) falls back to the file again.
  assert.equal((await aCall(t, 'PUT', '/v1/admin/picks/2026-09-21', owner, { version: 1, items: [] })).status, 200);
  assert.equal((await t.q("SELECT 1 FROM pick_days WHERE day = '2026-09-21'")).length, 0);
  const c = await discover(t);
  assert.ok(c.picks.length > 0);
  assert.equal(c.date, '2026-09-20');
  await t.close();
});

test('G-P3: a save on an old version is refused 409 changed and changes nothing', async () => {
  const { t, owner } = await adminSetup({ picksRaw: FILE, today: () => TODAY });
  const first = await aCall(t, 'PUT', `/v1/admin/picks/${TODAY}`, owner, { version: 0, items: [{ feedUrl: FX, why: 'Tab one.' }] });
  assert.equal(first.status, 200);
  const stale = await aCall(t, 'PUT', `/v1/admin/picks/${TODAY}`, owner, { version: 0, items: [{ feedUrl: FX, why: 'Tab two.' }] });
  assert.equal(stale.status, 409);
  const body = (await stale.json()) as { error: string; message: string; version: number };
  assert.equal(body.error, 'changed');
  assert.match(body.message, /reload/i);
  assert.equal(body.version, 1);
  assert.deepEqual((await t.q<{ why: string }>('SELECT why FROM pick_items')).map((r) => r.why), ['Tab one.']);
  assert.equal((await auditRows(t)).length, 1, 'the refused save left no record');
  await t.close();
});

test('the file rules apply (quote 1–140, ≤ 5 a day); an episode that does not resolve is saved WITH a warning and Discover skips it', async () => {
  const { t, owner } = await adminSetup({ picksRaw: FILE, today: () => TODAY });
  const long = await aCall(t, 'PUT', `/v1/admin/picks/${TODAY}`, owner, { version: 0, items: [{ feedUrl: FX, why: 'x'.repeat(141) }] });
  assert.equal(long.status, 422);
  const six = await aCall(t, 'PUT', `/v1/admin/picks/${TODAY}`, owner, { version: 0, items: Array.from({ length: 6 }, (_, i) => ({ feedUrl: FX, why: `n${i}` })) });
  assert.equal(six.status, 422);
  const res = await aCall(t, 'PUT', `/v1/admin/picks/${TODAY}`, owner, { version: 0, items: [
    { feedUrl: FX, guid: 'missing', why: 'Gone.' }, { feedUrl: FX, guid: 'g-new', why: 'Here.' },
  ] });
  assert.equal(res.status, 200);
  const r = (await res.json()) as { warnings: string[] };
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0]!, /not in the feed/);
  assert.deepEqual((await discover(t)).picks.map((p) => p.why), ['Here.']);
  await t.close();
});

test('issues and collections: saved in Admin they replace the file by id, retire hides them, versions are checked', async () => {
  const { t, owner } = await adminSetup({ picksRaw: { picks: FILE, issues: [{ id: 'file-issue', date: '2026-09-01', title: 'File', intro: 'From the file.', items: [] }] }, today: () => TODAY });
  const put = await aCall(t, 'PUT', '/v1/admin/issues/admin-issue', owner, { version: 0, day: '2026-09-21', title: 'Admin', intro: 'Made in Admin.', items: [{ feedUrl: FX, note: 'Listen.' }] });
  assert.equal(put.status, 200, await put.clone().text());
  const list = (await (await t.call('GET', '/v1/issues')).json()) as { issues: { id: string }[] };
  assert.deepEqual(list.issues.map((i) => i.id), ['admin-issue', 'file-issue']);
  assert.equal((await aCall(t, 'DELETE', '/v1/admin/issues/file-issue?version=0', owner)).status, 200);
  const after = (await (await t.call('GET', '/v1/issues')).json()) as { issues: { id: string }[] };
  assert.deepEqual(after.issues.map((i) => i.id), ['admin-issue'], 'retiring a file issue hides it');
  assert.equal((await aCall(t, 'PUT', '/v1/admin/issues/admin-issue', owner, { version: 0, day: '2026-09-21', title: 'Again', intro: 'x', items: [] })).status, 409);

  const col = await aCall(t, 'PUT', '/v1/admin/collections/admin-col', owner, { version: 0, title: 'Admin collection', position: 0, items: [{ feedUrl: FX }] });
  assert.equal(col.status, 200, await col.clone().text());
  const cols = (await (await aCall(t, 'GET', '/v1/admin/collections', owner)).json()) as { items: { id: string; source: string; version: number }[] };
  assert.deepEqual(cols.items.filter((c) => c.source === 'admin').map((c) => [c.id, c.version]), [['admin-col', 1]]);
  assert.deepEqual((await auditRows(t)).map((r) => r.area), ['issues', 'issues', 'collections']);
  await t.close();
});
