import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// 038 (run 41961274572): with the brand and icon fonts loaded, the device check's hierarchy gained two kinds of node the frame check took for small tappables:
// an icon-font glyph (a private-use character; the thumbs-up of the rating sheet, 29 x 29) and a two-letter rail label turned on its side ("Me", 15 x 15).
// Neither is a control. A real small control must still be caught.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.maestro', 'check', 'a11y-frames.mjs');
const node = (label, bounds, children = []) => ({ attributes: { accessibilityText: label, bounds, enabled: 'true' }, children });
function run(...nodes) {
  const dir = mkdtempSync(path.join(tmpdir(), 'a11y-frames-'));
  mkdirSync(path.join(dir, 'hierarchy'));
  writeFileSync(path.join(dir, 'hierarchy', 'x-end.json'), JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: nodes }));
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
}

test('an icon-font glyph (private-use character) is drawing, not a control', () => {
  assert.equal(run(node('', '[325,625][354,654]')).status, 0);
});

test('a two-letter rail label turned on its side (15 x 15) is a section label, not a control', () => {
  assert.equal(run(node('Me', '[6,311][21,326]')).status, 0);
});

test('a real labelled control under 44 x 44 is still caught', () => {
  const r = run(node('Post', '[300,100][365,138]'));
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /"Post" is 65 x 38 pt/);
});

test('an 18 x 18 labelled dot is still caught (the comment pins are wider than a turned label\'s 15 pt line)', () => {
  assert.equal(run(node('Comment at 0:05', '[100,100][118,118]')).status, 1);
});

test('a 30 x 30 labelled tappable is still caught', () => {
  assert.equal(run(node('Reply', '[100,100][130,130]')).status, 1);
});
