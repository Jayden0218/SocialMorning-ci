// M26 guard G-M26-0: no database call outside src/db/ — every query lives in a named repo function.
/**
 * Lane F0 (specs/027-m26-dynamodb/tasks.md F0-01) moved every inline `db.query(` / `.exec(` /
 * `.transaction(` from routes, auth, catalog, pages, translate and share into `src/db/repos/`.
 * The DynamoDB lanes then rewrite the repos only; a query left in a route would be missed.
 * This guard reads the source text of every file under src/ (except src/db/) and fails on any of
 * the three calls. Nothing is allowed silently — the only exceptions are listed below, each with
 * its reason, and each is matched by its exact shape, never by file:
 *
 *  1. `c.req.query(` — Hono's reader of the URL query string, not SQL.
 *  2. `/…/flags.exec(` — RegExp.prototype.exec on a regex literal, not SQL.
 *  3. `TIME.exec(` in src/translate/job.ts — RegExp.exec on the module's timestamp regex constant.
 *
 * Red check (lane-f0a-red): put one `await c.get('db').query('SELECT 1')` back in a route → red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** The one named exception that is not caught by a shape rule: file → exact text, with the reason above. */
const NAMED: Record<string, string[]> = {
  'translate/job.ts': ['TIME.exec('],
};

const CALL = /\.(query|exec|transaction)\b\s*[<(]/g;

/** The forbidden calls in one file's text, after the listed exceptions are taken out. */
export function inlineCalls(file: string, text: string): string[] {
  let t = text
    .replace(/\breq\.query\s*\(/g, '') // 1. Hono URL query string
    .replace(/\/[dgimsuyv]*\.exec\s*\(/g, ''); // 2. regex literal .exec(
  for (const named of NAMED[file] ?? []) t = t.split(named).join(''); // 3.
  const hits: string[] = [];
  const lines = t.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CALL)) hits.push(`${file}:${i + 1}: ${m[0]} — ${line.trim().slice(0, 120)}`);
  });
  return hits;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

test('G-M26-0: the matcher finds an inline query (positive control — an empty scan is not a pass)', () => {
  assert.equal(inlineCalls('x.ts', "await c.get('db').query('SELECT 1')").length, 1);
  assert.equal(inlineCalls('x.ts', 'await db.query<{ n: number }>(`SELECT 1`)').length, 1);
  assert.equal(inlineCalls('x.ts', 'await tx.exec(sql)').length, 1);
  assert.equal(inlineCalls('x.ts', 'return db.transaction(async (tx) => 1)').length, 1);
  assert.equal(inlineCalls('x.ts', "const q = c.req.query('q'); const m = /^a$/i.exec(s);").length, 0);
  assert.equal(inlineCalls('x.ts', 'const m = TIME.exec(t);').length, 1, 'TIME.exec is excepted in translate/job.ts only');
});

test('G-M26-0: no .query( / .exec( / .transaction( in apps/api/src outside src/db/', () => {
  const files = walk(SRC).filter((p) => !relative(SRC, p).split(sep).join('/').startsWith('db/'));
  assert.ok(files.length > 100, `scanned only ${files.length} files — the walk is broken`);
  const hits = files.flatMap((p) => inlineCalls(relative(SRC, p).split(sep).join('/'), readFileSync(p, 'utf8')));
  assert.deepEqual(hits, [], `database calls outside src/db/ — move each into a function in src/db/repos/:\n${hits.join('\n')}`);
});
