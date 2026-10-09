// Lint rule for M26: no full-table Scan (or PartiQL, which can scan) anywhere in the API outside src/jobs/.
/**
 * plan.md risk R11 ("Cost from a mistake — a Scan in a hot path") and tasks.md common rules: `ScanCommand`
 * only in `src/jobs/`. The repo has no ESLint, so the rule is this test: it reads every .ts file under
 * src/ and fails naming each file that uses Scan or PartiQL outside src/jobs/. It needs no database and runs
 * in the gate as well as in ddb-api.yml.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ALLOWED = path.join(SRC, 'jobs') + path.sep;
const FORBIDDEN = /\b(ScanCommand|paginateScan|ExecuteStatementCommand|BatchExecuteStatementCommand|ExecuteTransactionCommand)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Files outside src/jobs/ that mention a forbidden command (exported for the red check). */
export function scanOffenders(root = SRC): string[] {
  return files(root).filter((f) => !f.startsWith(ALLOWED) && FORBIDDEN.test(readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
}

test('no Scan / PartiQL outside src/jobs/ (M26 lint rule)', () => {
  assert.deepEqual(scanOffenders(), [], 'a full-table Scan belongs in a job (src/jobs/), never in a request path');
});
