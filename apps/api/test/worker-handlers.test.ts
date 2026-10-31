// M32 A1 (specs/034-m32-code-review, review.md A1): a cold worker process must know every outbox handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
});

/** Every kind some `enqueue(..., { kind: X })` call writes: a literal, or a constant defined as `const X = '...'` in src/. */
function enqueuedKinds(): string[] {
  const files = walk(SRC).filter((f) => !f.endsWith('/jobs/outbox.ts'));
  const text = files.map((f) => readFileSync(f, 'utf8'));
  const constants = new Map<string, string>();
  for (const t of text) for (const m of t.matchAll(/const\s+([A-Z_0-9]+)\s*=\s*'([^']+)'/g)) constants.set(m[1]!, m[2]!);
  const kinds = new Set<string>();
  for (const t of text) {
    for (const m of t.matchAll(/enqueue\([^)]*?\{\s*kind:\s*(?:'([^']+)'|([A-Z_0-9]+))/g)) {
      const k = m[1] ?? constants.get(m[2]!);
      assert.ok(k, `could not resolve the outbox kind ${m[2]}`);
      kinds.add(k);
    }
  }
  return [...kinds].sort();
}

function coldHandlers(entry: string): string[] {
  const code = `import('${new URL(`../src/${entry}`, import.meta.url).pathname}').then(async () => { const { registeredHandlers } = await import('${new URL('../src/jobs/outbox.ts', import.meta.url).pathname}'); console.log('KINDS=' + JSON.stringify(Object.keys(registeredHandlers()).sort())); });`;
  const out = execFileSync(process.execPath, ['--import', 'tsx', '-e', code], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  const line = out.split('\n').find((l) => l.startsWith('KINDS='));
  assert.ok(line, `no KINDS line in: ${out}`);
  return JSON.parse(line.slice(6)) as string[];
}

test('the scan finds the outbox kinds the code writes (so an empty scan cannot pass)', () => {
  const kinds = enqueuedKinds();
  for (const k of ['sg:fanout', 'sg:listen', 'sg:follow', 'sg:unfollow', 'push:status', 'reports:close', 'heat.place', 'st:fact']) assert.ok(kinds.includes(k), `scan missed ${k}`);
});

for (const entry of ['worker-entry.ts', 'lambda-entry.ts']) {
  test(`a cold process that imports only ${entry} has a handler for every outbox kind in src/`, () => {
    const registered = coldHandlers(entry);
    const missing = enqueuedKinds().filter((k) => !registered.includes(k));
    assert.deepEqual(missing, [], `no handler registered for: ${missing.join(', ')} (registered: ${JSON.stringify(registered)})`);
  });
}
