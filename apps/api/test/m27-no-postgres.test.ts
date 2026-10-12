// G-M27-NOPG: the API, the Studio and the shared packages carry no Postgres — only apps/pg-migration may.
/**
 * M27 "remove Postgres". The API runs on DynamoDB alone. This scans what ships (apps/api/src, apps/api/test, apps/api/scripts, the Studio, the
 * packages) for a Postgres driver import, PGlite, DATABASE_URL, or a package.json dependency on either, and checks the
 * `Db` handle has no SQL methods. The one allowed home is apps/pg-migration (the one-time copy from the old database).
 *
 * The break that turns it red: add `import postgres from 'postgres';` to any file under apps/api/src.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCAN = ['apps/api/src', 'apps/api/test', 'apps/api/scripts', 'apps/api/infra', 'apps/studio/src', 'apps/studio/e2e', 'packages'];
const SELF = path.join(ROOT, 'apps/api/test/m27-no-postgres.test.ts');
const SKIP_DIR = new Set(['node_modules', 'dist', 'dist-lambda', 'e2e-results', 'e2e-report', 'coverage']);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mjs|js|json|sh|yml)$/.test(name) && p !== SELF) yield p;
  }
}

const IMPORT = /(?:from|import|require\()\s*['"](?:postgres|pg|@electric-sql\/pglite[^'"]*|@neondatabase\/[^'"]*)['"]/;

test('G-M27-NOPG: no file outside apps/pg-migration imports a Postgres driver or reads DATABASE_URL', () => {
  const bad: string[] = [];
  for (const d of SCAN) {
    for (const f of files(path.join(ROOT, d))) {
      const text = readFileSync(f, 'utf8');
      if (IMPORT.test(text)) bad.push(`${path.relative(ROOT, f)}: imports a Postgres driver`);
      if (/process\.env\[?\.?['"]?DATABASE_URL/.test(text)) bad.push(`${path.relative(ROOT, f)}: reads DATABASE_URL`);
    }
  }
  assert.deepEqual(bad, [], 'Postgres belongs only in apps/pg-migration');
});

test('G-M27-NOPG: the API and Studio package.json files have no Postgres dependency', () => {
  for (const p of ['apps/api/package.json', 'apps/studio/package.json', 'package.json']) {
    const j = JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')) as Record<string, Record<string, string> | undefined>;
    for (const k of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(j[k] ?? {})) assert.ok(!/^(postgres|pg|pg-mem|@electric-sql\/pglite|@neondatabase\/.*)$/.test(name), `${p} ${k} has ${name}`);
    }
  }
});

test('G-M27-NOPG: the Db handle has no SQL methods', async () => {
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { freshStore } = await import('./harness.ts');
  const s = await freshStore();
  try {
    const db = withStore(undefined, s.store) as unknown as Record<string, unknown>;
    assert.equal(db['query'], undefined);
    assert.equal(db['exec'], undefined);
  } finally { await s.close(); }
});
