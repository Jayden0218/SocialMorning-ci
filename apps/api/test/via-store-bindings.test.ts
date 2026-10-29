// M32 T017 (review D2): every viaStore('<lane>/<file>', '<name>') binding names a module and an export that exist.
/**
 * Guard G-M32-D2: `viaStore` resolves its target only when first called, so a misspelt name would fail at run time,
 * on the first request that needs it. This reads every binding in src/, resolves the lane folder as
 * src/db/backend.ts does (DDB_LOADERS), imports the module and checks the export is a function.
 * Break: misspell one binding name, e.g. 'approveHeld' → 'approveHeldX' in src/db/repos/studio/comment-policy.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = resolve(import.meta.dirname, '../src');
const BACKEND = join(SRC, 'db/backend.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** lane → folder, read from backend.ts's DDB_LOADERS lines: `lb: (f) => import(`./repos/library/ddb/${f}.ts`),` */
function lanes(): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of readFileSync(BACKEND, 'utf8').matchAll(/^\s*(\w+): \(f\) => import\(`\.\/([^$`]+)\$\{f\}\.ts`\)/gm)) m.set(x[1]!, join(SRC, 'db', x[2]!));
  return m;
}

test('G-M32-D2: every viaStore binding points at an existing module and export', async () => {
  const folders = lanes();
  assert.ok(folders.size >= 9, `read the lane table from backend.ts (got ${folders.size})`);
  const bindings: { file: string; mod: string; name: string }[] = [];
  for (const f of walk(SRC)) {
    if (f === BACKEND) continue;
    const text = readFileSync(f, 'utf8');
    if (!text.includes('viaStore')) continue;
    for (const x of text.matchAll(/\(\s*'([a-z]+\/[\w-]+)'\s*,\s*'(\w+)'\s*\)/g)) bindings.push({ file: f.slice(SRC.length + 1), mod: x[1]!, name: x[2]! });
  }
  assert.ok(bindings.length > 100, `found the bindings (got ${bindings.length})`);
  const bad: string[] = [];
  const loaded = new Map<string, Record<string, unknown> | string>();
  for (const b of bindings) {
    const [lane, file] = b.mod.split('/') as [string, string];
    const dir = folders.get(lane);
    if (!dir) { bad.push(`${b.file}: unknown lane '${lane}' in '${b.mod}'`); continue; }
    const path = `${dir}${file}.ts`;
    if (!loaded.has(path)) {
      try { loaded.set(path, (await import(pathToFileURL(path).href)) as Record<string, unknown>); } catch (e) { loaded.set(path, e instanceof Error ? e.message : String(e)); }
    }
    const m = loaded.get(path)!;
    if (typeof m === 'string') bad.push(`${b.file}: '${b.mod}' cannot be imported (${m})`);
    else if (typeof m[b.name] !== 'function') bad.push(`${b.file}: '${b.mod}' has no function export '${b.name}'`);
  }
  assert.deepEqual(bad, [], `${bad.length} broken viaStore binding(s)`);
});
