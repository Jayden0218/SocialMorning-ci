// M25 G3 guard: every repo that writes a jsonb column stores an object or an array, never a JSON string.
/**
 * The bug class that shipped three times (M5 cache bodies, M14 listened ranges + library rows,
 * M19 announcement images): the production `postgres` driver JSON-encodes a STRING parameter cast
 * `$n::jsonb` a second time, so `JSON.stringify(x)` lands as a jsonb *string*. PGlite does not, so
 * this test can only go red on real PostgreSQL — `TEST_DB=postgres` (ci/workflows/postgres-api.yml).
 * On PGlite it still runs and checks the same rows.
 *
 * It writes through each repo function (not raw SQL), then sweeps EVERY jsonb column in the schema:
 * no row may be a jsonb string, and each column this test wrote must hold the expected type.
 *
 * The break that turns it red (seen on lane-gb-red, see tasks.md GB): in
 * `src/db/repos/account/queue.ts` `putQueue`, write `$2::jsonb` instead of `($2::text)::jsonb`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, TEST_DB } from './harness.ts';
import { addEpisode } from './studio-harness.ts';
import { cached } from '../src/db/repos/cache.ts';
import { replaceRanges } from '../src/db/repos/library/listened.ts';
import { merge } from '../src/db/repos/library/library.ts';
import { createCodes } from '../src/db/repos/account/redeem.ts';
import { putOverrides } from '../src/db/repos/studio/show-overrides.ts';
import { createReport, transcriptTargetId } from '../src/db/repos/safety/reports.ts';
import { insertAudit } from '../src/auth/admin.ts';
import { publish } from '../src/db/repos/studio/announcements.ts';
import { notify } from '../src/db/repos/social/notifications.ts';
import { setMaintenance } from '../src/db/repos/safety/maintenance.ts';
import { putQueue } from '../src/db/repos/account/queue.ts';
import { putWeights } from '../src/db/repos/discover/foryou-rules.ts';
import { putConfig } from '../src/db/repos/config/app-config.ts';
import { recordUpload } from '../src/db/repos/social/status-items.ts';

const FEED = 'https://feeds.example.com/jsonb.xml';

/** column → the jsonb type this test's writes must leave in it. */
const EXPECTED: Record<string, 'object' | 'array'> = {
  'cache.body': 'object',
  'listened_ranges.ranges': 'array',
  'library_items.payload': 'object',
  'redeem_codes.grants': 'object',
  'show_overrides.hosts': 'array',
  'show_overrides.links': 'array',
  'show_overrides.contacts': 'array',
  'reports.snapshot': 'object',
  'reports.detail': 'object',
  'admin_audit.before': 'object',
  'admin_audit.after': 'object',
  'announcements.images': 'array',
  'notifications.ref': 'object',
  'app_settings.value': 'object',
  'queues.items': 'array',
  'foryou_weights.weights': 'object',
  'app_config.value': 'object',
};

test(`jsonb: every repo writer stores objects and arrays, never a JSON string (${TEST_DB})`, async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'A');
  const b = await signUp(t, 'b@example.com', 'B');
  await addEpisode(t, FEED, 'E1', 'One', 1_000_000);
  const later = new Date(Date.now() + 86_400_000).toISOString();

  await cached(t.db, 'jsonb:test', 0, async () => ({ a: 1, list: [1, 2] }));
  await recordUpload(t.db, { pathname: 'statuses/x.jpg', url: 'https://blob.example.com/x.jpg', bytes: 10, listenerId: a.id });
  await replaceRanges(t.db, a.id, 'd1', [{ episodeId: 'E1', day: '2026-10-01', ranges: [[0, 1000]] }]);
  await merge(t.db, a.id, [{ kind: 'moment', key: 'm1', payload: { note: 'hello' }, updatedAt: new Date().toISOString() }]);
  await createCodes(t.db, { grant: { kind: 'plus', days: 7 }, count: 1, maxUses: 1, note: 'n', expiresAt: null, createdBy: a.id });
  await putOverrides(t.db, FEED, a.id, {
    hosts: ['Host'], links: [{ label: 'Site', url: 'https://example.com' }], contacts: [{ type: 'website', value: 'https://example.com' }],
  });
  await createReport(t.db, { kind: 'episode', targetId: 'E1', reporterId: b.id, reason: 'spam' });
  await createReport(t.db, {
    kind: 'transcript', targetId: transcriptTargetId('E1', 1000), reporterId: b.id, reason: 'other',
    detail: { episodeId: 'E1', offsetMs: 1000, original: 'helo', suggested: 'hello' },
  });
  await insertAudit(t.db, { adminId: a.id }, { area: 'discover', action: 'jsonb-test', target: 'x' }, { was: 1 }, { now: 2 });
  await publish(t.db, fetch, FEED, null, a.id, 'Hello', { images: ['https://blob.example.com/a.jpg'], releaseAt: later });
  assert.equal(await notify(t.db, { recipientId: b.id, actorId: a.id, kind: 'follow', ref: { from: 'jsonb-test' } }), true);
  await setMaintenance(t.db, { until: later, message: 'Back soon' }, a.id);
  await putQueue(t.db, a.id, ['E1'], 0, 'd1');
  await putWeights(t.db, 0, { affinity: 1 });
  await putConfig(t.db, 'listSizes', 0, { discover: 10 });

  const cols = await t.q<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'jsonb' ORDER BY 1, 2`);
  assert.ok(cols.length >= Object.keys(EXPECTED).length, `found only ${cols.length} jsonb columns`);
  const found: Record<string, { strings: number; rows: number; types: string[] }> = {};
  for (const c of cols) {
    const [r] = await t.q<{ strings: number; rows: number; types: string[] | null }>(
      `SELECT count(*) FILTER (WHERE jsonb_typeof("${c.column_name}") = 'string')::int AS strings,
              count("${c.column_name}")::int AS rows,
              array_agg(DISTINCT jsonb_typeof("${c.column_name}")) FILTER (WHERE "${c.column_name}" IS NOT NULL) AS types
         FROM "${c.table_name}"`);
    found[`${c.table_name}.${c.column_name}`] = { strings: Number(r!.strings), rows: Number(r!.rows), types: r!.types ?? [] };
  }
  const asStrings = Object.entries(found).filter(([, v]) => v.strings > 0).map(([k, v]) => `${k} (${v.strings})`);
  assert.deepEqual(asStrings, [], `jsonb columns holding JSON strings (double-encoded): ${asStrings.join(', ')}`);
  for (const [col, type] of Object.entries(EXPECTED)) {
    assert.ok(found[col], `${col} is not a jsonb column any more — update this test`);
    assert.ok(found[col]!.rows > 0, `${col}: this test wrote nothing into it`);
    assert.deepEqual(found[col]!.types, [type], `${col} holds ${found[col]!.types.join('/')}, expected ${type}`);
  }
  await t.close();
});
