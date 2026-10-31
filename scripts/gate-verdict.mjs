// The verdict of a commit's CI runs: the WORST conclusion over every workflow run of that commit, not just `gate`.
// M27 FR-041 (research D4): scripts/commit-gated.sh watched only the `gate` workflow, so a red `ddb-api` run could sit under "GREEN".
// Input: the JSON `gh run list -R <mirror> --commit <sha> --json name,status,conclusion` prints (stdin or a file argument).
// Output: GREEN | RED | PENDING | NONE on stdout, plus one line per run on stderr; exit 0 / 1 / 2 / 2.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BAD = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);
// Workflows that run on EVERY push. The others (studio-e2e, infra, codeql, android-compile) have path filters: no run for
// them on a commit means their paths did not change, and is not waited for. A required one missing means GitHub has not
// listed it yet: PENDING, never GREEN.
export const REQUIRED = ['gate'];
/** Conclusions that do not make a commit red: success, skipped, neutral; `cancelled` only counts as red when nothing newer replaced it (the caller decides). */
export function verdict(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return 'NONE';
  const done = runs.filter((r) => r.status === 'completed');
  if (done.some((r) => BAD.has(r.conclusion) || r.conclusion === 'cancelled')) return 'RED';
  if (done.length < runs.length) return 'PENDING';
  if (REQUIRED.some((name) => !runs.some((r) => r.name === name))) return 'PENDING';
  return 'GREEN';
}

export function describe(runs) {
  return runs.map((r) => `  ${r.name}: ${r.status === 'completed' ? r.conclusion : r.status}`).join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runs = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'));
  const v = verdict(runs);
  if (runs.length) console.error(describe(runs));
  console.log(v);
  process.exit(v === 'GREEN' ? 0 : v === 'RED' ? 1 : 2);
}
