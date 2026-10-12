// Fails when an API test file is neither run by the DynamoDB suites (DDB_FILES) nor explicitly skipped (DDB_SKIP) in ci/workflows/ddb-api.yml.
// M27 FR-042 / research D5: new test files used to be silently left out of the DynamoDB run (a hand list).
// Usage: node scripts/check-ddb-files.mjs [path to ddb-api.yml]   (cwd: apps/api). Prints each unlisted file and exits 1.
import { readFileSync, readdirSync } from 'node:fs';

const workflow = process.argv[2] ?? '../../ci/workflows/ddb-api.yml';
const text = readFileSync(workflow, 'utf8');

/** The words of a folded block (`NAME: >-` followed by indented lines), with full-line `#` comments dropped. */
function block(name) {
  const m = new RegExp(`^  ${name}: >-\\n((?:    .*\\n?)+)`, 'm').exec(text);
  if (!m) return null;
  return m[1].split('\n').filter((l) => !l.trim().startsWith('#')).join(' ').split(/\s+/).filter(Boolean);
}
const files = block('DDB_FILES');
const skipped = block('DDB_SKIP');
if (!files) { console.error(`no DDB_FILES block in ${workflow}`); process.exit(1); }
if (!skipped) { console.error(`no DDB_SKIP block in ${workflow} (list the files that must not run on DynamoDB, with a comment each)`); process.exit(1); }

const matches = (pattern, file) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(file);
const tests = readdirSync('test').filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`).sort();
const unlisted = tests.filter((f) => !files.some((p) => matches(p, f)) && !skipped.some((p) => matches(p, f)));
const both = tests.filter((f) => files.some((p) => matches(p, f)) && skipped.some((p) => matches(p, f)));
const dead = skipped.filter((p) => !tests.some((f) => matches(p, f)));
for (const f of unlisted) console.error(`not run on DynamoDB and not in DDB_SKIP: ${f} — add it to DDB_FILES, or to DDB_SKIP with the reason`);
for (const f of both) console.error(`in both DDB_FILES and DDB_SKIP: ${f}`);
for (const p of dead) console.error(`DDB_SKIP names a file that does not exist: ${p}`);
if (unlisted.length || both.length || dead.length) process.exit(1);
console.log(`every test file is covered: ${tests.length} files (${tests.length - skipped.length} on DynamoDB, ${skipped.length} skipped on purpose)`);
