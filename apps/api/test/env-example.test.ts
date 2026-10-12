// M27 T028 (G-DV1): apps/api/.env.example lists every environment variable the API reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const EXAMPLE = readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'migrations' ? [] : files(p);
    return /\.(ts|mts)$/.test(n) ? [p] : [];
  });
}

/** Names read as process.env.X, process.env['X'], env['X'] or env.X (an `env` parameter holding process.env). */
export function variablesRead(): Map<string, string> {
  const found = new Map<string, string>();
  const re = /(?:process\.env|\benv)(?:\.([A-Z][A-Z0-9_]+)|\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\])/g;
  for (const f of files(SRC)) for (const m of readFileSync(f, 'utf8').matchAll(re)) found.set((m[1] ?? m[2])!, f.slice(SRC.length + 1));
  return found;
}

const listed = (name: string) => new RegExp(`^#?\\s*${name}=`, 'm').test(EXAMPLE);

test('.env.example lists every variable the code reads', () => {
  const read = variablesRead();
  assert.ok(read.size >= 30, `found only ${read.size} variables — the scan is broken`);
  const missing = [...read].filter(([name]) => !listed(name)).map(([name, file]) => `${name} (read in src/${file})`);
  assert.deepEqual(missing, [], `add these to apps/api/.env.example: ${missing.join(', ')}`);
});

test('.env.example holds no real-looking secret', () => {
  assert.ok(!/postgres:\/\/[^:\s]+:(?!password@)[^@\s]+@/.test(EXAMPLE), 'a Postgres URL with a password');
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(EXAMPLE), 'an AWS key id');
  assert.ok(!/[0-9a-f]{40,}/.test(EXAMPLE), 'a long hex string');
});
