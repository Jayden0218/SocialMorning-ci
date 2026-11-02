// Tests the device check's category-request counter (036 T021, C2): GET /v1/categories/ lines in api.log for one Discover visit.
/**
 * `.maestro/check/check-categories.mjs <api.log>` reads the test server's request log (apps/api/scripts/request-log.ts: an arrival line
 * `<iso> -> <id> GET <path>` and a finish line `<iso> <- <id> <status> <ms>ms`). r25-categories.yaml brackets each Discover visit with two
 * marker requests (`GET /__e2e/removed` opens a visit, `GET /__e2e/code` closes it). A visit may ask for at most 8 category pages plus one
 * more for each of its own failures (a 5xx, or no finish line); more fails, and a log with no complete visit fails too (a check that read
 * nothing proved nothing). Hand-made logs here.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', '.maestro', 'check', 'check-categories.mjs');
let n = 0;
const id = () => (++n).toString(16).padStart(8, '0');
const T = '2026-11-02T10:00:00.000Z';
const req = (method: string, p: string, status: number | null = 200): string[] => {
  const i = id();
  return [`${T} -> ${i} ${method} ${p}`, ...(status === null ? [] : [`${T} <- ${i} ${status} 12ms`])];
};
const visit = (...inside: string[][]): string[] => [...req('GET', '/__e2e/removed'), ...inside.flat(Infinity) as string[], ...req('GET', '/__e2e/code', 404)];
const cats = (count: number, status: number | null = 200): string[][] => Array.from({ length: count }, (_, k) => req('GET', `/v1/categories/${1300 + k}`, status));
function run(lines: string[]): { status: number | null; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'cats-'));
  const file = path.join(dir, 'api.log');
  writeFileSync(file, lines.join('\n') + '\n');
  const r = spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

it('a visit with 8 category requests passes', () => {
  expect(run(visit(cats(8))).status).toBe(0);
});

it('a visit with 9 category requests and no failure fails, and says how many', () => {
  const r = run(visit(cats(9)));
  expect(r.status).toBe(1);
  expect(r.out).toContain('9 GET /v1/categories/');
});

it('each failed request earns one more: 8 + 2 failures = 10 passes, 11 fails', () => {
  expect(run(visit(cats(8), cats(2, 503))).status).toBe(0);
  expect(run(visit(cats(9), cats(2, 503))).status).toBe(1);
});

it('a request with no finish line counts as a failure', () => {
  expect(run(visit(cats(8), cats(1, null))).status).toBe(0);
});

it('other paths, other methods and requests outside a visit are not counted', () => {
  const outside = cats(30);
  const lines = [...outside.flat(), ...visit(cats(2), req('GET', '/v1/categories'), req('POST', '/v1/categories/1300'), req('GET', '/v1/shows/x'))];
  expect(run(lines).status).toBe(0);
});

it('two visits are judged one by one', () => {
  expect(run([...visit(cats(8)), ...visit(cats(9))]).status).toBe(1);
  expect(run([...visit(cats(8)), ...visit(cats(0))]).status).toBe(0);
});

it('a log with no complete visit fails: nothing was read', () => {
  expect(run(req('GET', '/v1/health')).status).toBe(1);
  expect(run(req('GET', '/__e2e/removed')).status).toBe(1);
});
