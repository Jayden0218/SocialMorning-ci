// Tests that docs/legal/retention-schedule.md says what the code does, and that the privacy policy links to it.
/**
 * M28 US9 guard G-M28-RET (contracts/gates.md "Retention guard", research R13).
 *
 * The break that turns it red (watched once): change `ERROR_DAYS` in `src/db/repos/account/error-reports.ts`
 * (30 → 31) and leave the document alone — the first test fails naming `ERROR_DAYS`.
 * Second break: add `export const NEW_KEEP_DAYS = 5;` under `src/db/repos` with no row — the third test names it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const API = new URL('..', import.meta.url).pathname;
const SRC = join(API, 'src');
const SCHEDULE = join(API, '../../docs/legal/retention-schedule.md');
const POLICY = join(API, '../../docs/legal/privacy-policy.md');
// docs/ never reaches the public CI mirror (scripts/push-ci.sh): there these guards skip, as the deploy-workflow ones do.
const DOCS = existsSync(SCHEDULE) && existsSync(POLICY);
const onlyWithDocs = { skip: !DOCS && 'docs/legal is private-repo only (not in the mirror)' };

type Row = { constant: string; module: string; days: number };

/** Every table row of the schedule that names a constant: `constant` and `module` are columns found by header name. */
function scheduleRows(): Row[] {
  const rows: Row[] = [];
  let cols: string[] | null = null;
  for (const line of readFileSync(SCHEDULE, 'utf8').split('\n')) {
    if (!line.startsWith('|')) { cols = null; continue; }
    const cells = line.slice(1, line.lastIndexOf('|')).split('|').map((c) => c.trim());
    if (cols === null) { cols = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // the --- separator
    const at = (name: string) => cells[cols!.indexOf(name)] ?? '';
    if (!cols.includes('constant') || !cols.includes('module')) continue;
    const constant = at('constant').replace(/`/g, '');
    if (!/^[A-Z][A-Z0-9_]*$/.test(constant)) continue;
    rows.push({ constant, module: at('module').replace(/`/g, ''), days: Number(at('days')) });
  }
  return rows;
}

/** Every `export const X_DAYS = n` / `KEEP_DAYS = n` under src/db/repos and src/auth. */
function codeConstants(): { constant: string; module: string; days: number }[] {
  const out: { constant: string; module: string; days: number }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts')) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/^export const ([A-Z][A-Z0-9_]*(?:_DAYS|KEEP_DAYS))\s*=\s*(\d+)\b/gm)) {
        out.push({ constant: m[1]!, module: relative(SRC, p).split(sep).join('/'), days: Number(m[2]) });
      }
    }
  };
  walk(join(SRC, 'db/repos'));
  walk(join(SRC, 'auth'));
  return out;
}

test('G-M28-RET: every constant the schedule names exists in its module and equals the days in its row', onlyWithDocs, async () => {
  const rows = scheduleRows();
  assert.ok(rows.length >= 25, `the schedule has ${rows.length} rows with a constant`);
  const wrong: string[] = [];
  for (const r of rows) {
    assert.ok(Number.isInteger(r.days) && r.days > 0, `${r.constant}: the days column is a number, got ${r.days}`);
    const mod = (await import(join(SRC, r.module))) as Record<string, unknown>;
    if (!(r.constant in mod)) wrong.push(`${r.constant}: not exported by ${r.module}`);
    else if (mod[r.constant] !== r.days) wrong.push(`${r.constant}: code says ${String(mod[r.constant])}, the schedule says ${r.days}`);
  }
  assert.deepEqual(wrong, [], 'retention-schedule.md and the code disagree');
});

test('G-M28-RET: no constant is named by two rows', onlyWithDocs, () => {
  const keys = scheduleRows().map((r) => `${r.module}#${r.constant}`);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], 'a row is repeated');
});

test('G-M28-RET: every exported *_DAYS / KEEP_DAYS constant under src/db/repos and src/auth has a row', onlyWithDocs, () => {
  const rows = new Set(scheduleRows().map((r) => `${r.module}#${r.constant}`));
  const missing = codeConstants().filter((c) => !rows.has(`${c.module}#${c.constant}`)).map((c) => `${c.constant} (${c.module}) = ${c.days}`);
  assert.deepEqual(missing, [], 'add a row to docs/legal/retention-schedule.md for each of these');
  assert.ok(codeConstants().length >= 25, 'the scan found the constants');
});

test('G-M28-RET: the privacy policy links to the retention schedule', onlyWithDocs, () => {
  assert.match(readFileSync(POLICY, 'utf8'), /\(retention-schedule\.md\)/, 'privacy-policy.md must link to retention-schedule.md');
});
