// M27: the BUILT Lambda bundles work — the API answers from DynamoDB Local and the worker drains. (A bundle that lost a lazy
// `import()` passes every other test and fails here: found 2026-10-12, src/db/backend.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('lambda bundle (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { buildLambda, zipOne } = await import('../scripts/build-lambda.ts');
  const { createDdbClients } = await import('../src/db/ddb/client.ts');
  const { createTableSet, deleteTableSet } = await import('../src/db/ddb/schema.ts');
  const { tablesFor } = await import('../src/config.ts');

  test('zipOne makes a zip other tools can read', () => {
    const dir = mkdtempSync(`${tmpdir()}/zip-`);
    try {
      const data = Buffer.from('export const handler = () => 1;\n'.repeat(500));
      const zip = zipOne('index.mjs', data);
      assert.deepEqual([...zip.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
      const file = `${dir}/t.zip`;
      writeFileSync(file, zip);
      const r = spawnSync('python3', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; i=z.infolist()[0]; print(i.filename, i.file_size)', file], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), `index.mjs ${data.length}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('the built API bundle reads DynamoDB (a dual() repo route) and the worker bundle drains', async () => {
    await buildLambda();
    const prefix = `bnd${process.pid}x${Math.random().toString(36).slice(2, 6)}`;
    const clients = createDdbClients();
    await createTableSet(clients.raw, tablesFor(prefix));
    try {
      const root = fileURLToPath(new URL('..', import.meta.url));
      const r = spawnSync(process.execPath, [`${root}test/fixtures/run-bundle.mjs`, `${root}dist-lambda`, `${root}test/fixtures/lambda-events`], {
        encoding: 'utf8', cwd: tmpdir(),
        env: { PATH: process.env['PATH'] ?? '', SESSION_PEPPER: 'p'.repeat(32), APP_ENV: 'dev', DATA_BACKEND: 'ddb', DDB_ENDPOINT: process.env['DDB_ENDPOINT']!, DDB_TABLE_PREFIX: prefix, AWS_REGION: 'ap-southeast-1' },
      });
      assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
      const out = JSON.parse(r.stdout.trim().split('\n').pop()!) as { health: number; academy: number; academyBody: { items?: unknown[] }; worker: unknown };
      assert.equal(out.health, 200, 'GET /v1/health');
      assert.equal(out.academy, 200, 'GET /v1/content/academy (reads DynamoDB)');
      assert.ok(Array.isArray(out.academyBody.items), 'a list of pages (empty on a fresh table set)');
      assert.ok(!/Cannot find module/.test(r.stderr), r.stderr);
    } finally { await deleteTableSet(clients.raw, tablesFor(prefix)); clients.raw.destroy(); }
  });
}
