import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// 038 M5 (FR-005): the ratchet. Run on a fixture tree so the test does not move when the app's own counts go down.
// Seen red first: the script did not exist. The break that turns it red later: raise a count in scripts/design-baseline.json's
// opposite direction (lower a baseline below what the tree has) and the gate fails.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'design-check.mjs');
const ZERO = { oldSizeClasses: 0, drawnType: 0, rawPulseClasses: 0, typedFontSize: 0 };

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'design-check-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}
function run(root, baseline) {
  const b = path.join(root, 'baseline.json');
  writeFileSync(b, JSON.stringify(baseline));
  return spawnSync(process.execPath, [SCRIPT, '--root', root, '--baseline', b], { encoding: 'utf8' });
}

test('one old size class and a baseline of 0: exit 1, and it names the file and line', () => {
  const root = fixture({ 'app/a.tsx': 'const a = 1;\n<Text className="text-xs text-text">x</Text>\n' });
  const r = run(root, ZERO);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /oldSizeClasses: 1 > baseline 0/);
  assert.match(r.stderr, /app\/a\.tsx:2/);
});

test('the same tree with a baseline of 1: exit 0', () => {
  const root = fixture({ 'app/a.tsx': '<Text className="text-xs text-text">x</Text>\n' });
  assert.equal(run(root, { ...ZERO, oldSizeClasses: 1 }).status, 0);
});

test('each of the four counts is read', () => {
  const root = fixture({
    'app/a.tsx': [
      '<Text className="text-lg text-hero">x</Text>',
      'const s = drawnType.prompt; const t = drawnType.other;',
      '<Text className="text-pulse-row">x</Text>',
      'const u = { fontSize: 13 };',
    ].join('\n'),
  });
  const r = run(root, ZERO);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /oldSizeClasses: 2 > baseline 0/);
  assert.match(r.stderr, /drawnType: 2 > baseline 0/);
  assert.match(r.stderr, /rawPulseClasses: 1 > baseline 0/);
  assert.match(r.stderr, /typedFontSize: 1 > baseline 0/);
});

test('what is not a use is not counted: comments, src/design, Type.tsx, the 8 styles, text-pulse- in a style name, fontSize from a token', () => {
  const root = fixture({
    'app/a.tsx': [
      '// text-xs was the old class; drawnType.x; fontSize: 12',
      ' * text-lg',
      '<Type step="strong" className="text-text">x</Type>',
      'const u = { fontSize: size, lineHeight: 20 };',
      'const v = fontSize.body;',
    ].join('\n'),
    'src/design/type-px.ts': 'export const drawnType = {}; const x = { fontSize: 11 }; // text-pulse-row',
    'src/ui/kit/Type.tsx': '<Text className="text-pulse-row" />',
  });
  assert.equal(run(root, ZERO).status, 0);
});

test('a count that goes down passes, and says the baseline can be lowered', () => {
  const root = fixture({ 'app/a.tsx': '<Text className="text-xs">x</Text>\n' });
  const r = run(root, { ...ZERO, oldSizeClasses: 5 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /oldSizeClasses: 1 < baseline 5/);
});

test('a missing baseline file is an error, not a pass', () => {
  const root = fixture({ 'app/a.tsx': 'x' });
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, '--baseline', path.join(root, 'none.json')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});
