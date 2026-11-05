import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// 039 T020. r15-038-end.json is a HAND-BUILT reproduction of the 038 Notifications edges (title 16, cards 22, time chips 15, rows 59 pt; the real
// device-check artifact of run 41838290318 could not be downloaded in the sandbox). It must be red. r15-good-end.json has all text at 20 or 36.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', '.maestro', 'check', 'edges-check.mjs');
const FIX = path.join(HERE, 'fixtures', 'edges');
const run = (fixture, ...extra) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  mkdirSync(path.join(dir, 'hierarchy'));
  copyFileSync(path.join(FIX, fixture), path.join(dir, 'hierarchy', 'r15-end.json'));
  return spawnSync(process.execPath, [SCRIPT, dir, ...extra], { encoding: 'utf8' });
};

test("the 038 Notifications layout is red: text left of the gutter (its 15/16 edges cluster, so the count rule is not what fires)", () => {
  const r = run('r15-038-end.json');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /"Notifications" starts at 16 pt/);
  assert.match(r.stdout, /"2h" starts at 15 pt/);
});

test('text at 20 and 36 only is green', () => {
  const r = run('r15-good-end.json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /r15\t\d+\t20:\d+ 36:\d+\tok/);
});

test('five edges on or right of the gutter fail on the edge count alone', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const n = (l, x, y) => ({ attributes: { text: l, bounds: `[${x},${y}][${x + 100},${y + 20}]` }, children: [] });
  const f = path.join(dir, 't.json');
  writeFileSync(f, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [20, 36, 59, 80, 120].map((x, i) => n('t' + i, x, 100 + i * 40)) }));
  const r = spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /5 distinct row-start edges/);
});

test('a -bleed element, the tab bar and the status bar are exempt', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const n = (l, x, y, id = '') => ({ attributes: { text: l, 'resource-id': id, bounds: `[${x},${y}][${x + 100},${y + 20}]` }, children: [] });
  const f = path.join(dir, 't.json');
  writeFileSync(f, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [n('9:41', 5, 10), n('Hero', 0, 100, 'hero-bleed'), n('Body', 20, 200), n('Home', 5, 790, 'tab-home')] }));
  assert.equal(spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' }).status, 0);
});

// Device run 42017007191: the artifact holds `hierarchy/r13-me-end.json` (flow file name = id + slug), which the check did not find.
const runNamed = (name, ...extra) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  mkdirSync(path.join(dir, 'hierarchy'));
  copyFileSync(path.join(FIX, 'r15-good-end.json'), path.join(dir, 'hierarchy', name));
  return spawnSync(process.execPath, [SCRIPT, dir, ...extra], { encoding: 'utf8' });
};

test('finds hierarchy/<id>-<slug>-end.json by the short id, and says the flows that were not run were skipped', () => {
  const r = runNamed('r13-me-end.json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /r13-me\t\d+\t/);
  assert.match(r.stdout, /r04\t-\tnot run in this check\tskipped/);
  assert.match(r.stdout, /r15\t-\tnot run in this check\tskipped/);
});

test('finds the -xl variant (r13-xl-me-end.json) and does not mistake it for r13', () => {
  const r = runNamed('r13-xl-me-end.json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /r13-xl-me\t\d+\t/);
  assert.doesNotMatch(r.stdout, /^r13-me\t/m);
});

test('fails only when none of the requested flows has a file', () => {
  const r = runNamed('r99-other-end.json');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no hierarchy file for r04, r13, r15/);
});

test('a real `maestro hierarchy` root has bounds [0,0][0,0]: the screen is the first non-empty frame, and texts are still read (run 42017007191 read 0 texts)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const n = (l, x, y) => ({ attributes: { text: l, bounds: `[${x},${y}][${x + 100},${y + 20}]` }, children: [] });
  const f = path.join(dir, 't.json');
  writeFileSync(f, JSON.stringify({ attributes: { bounds: '[0,0][0,0]' }, children: [{ attributes: { bounds: '[0,0][390,844]' }, children: [n('Title', 20, 100), n('Left', 12, 200)] }] }));
  const r = spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /"Left" starts at 12 pt/);
});

test('the horizontal scroll bar (text "0%", accessibilityText "Horizontal scroll bar, 1 page") is not text', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const f = path.join(dir, 't.json');
  writeFileSync(f, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [{ attributes: { text: '0%', value: '0%', accessibilityText: 'Horizontal scroll bar, 1 page', bounds: '[0,300][390,330]' }, children: [] }, { attributes: { text: 'Body', bounds: '[20,200][120,220]' }, children: [] }] }));
  assert.equal(spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' }).status, 0);
});

test('three controls side by side in ONE row, the first at 20, are one row start (green); the same texts one under the other are five edges', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const n = (l, x, y) => ({ attributes: { text: l, bounds: `[${x},${y}][${x + 80},${y + 44}]` }, children: [] });
  const row = path.join(dir, 'row.json');
  writeFileSync(row, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [n('A', 20, 200), n('B', 121, 202), n('C', 250, 200), n('D', 150, 220), n('E', 190, 215), n('Next', 20, 300)] }));
  const r = spawnSync(process.execPath, [SCRIPT, row], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const col = path.join(dir, 'col.json');
  writeFileSync(col, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [n('A', 20, 200), n('B', 60, 300), n('C', 100, 400), n('D', 140, 500), n('E', 180, 600)] }));
  assert.equal(spawnSync(process.execPath, [SCRIPT, col], { encoding: 'utf8' }).status, 1);
});

// Device run 42025744841: the iOS keyboard's prediction bar ("Typing Predictions", x 0) was read as page text.
test('the keyboard prediction bar ("Typing Predictions") is not page text', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const n = (l, x, y) => ({ attributes: { accessibilityText: l, bounds: `[${x},${y}][${x + 100},${y + 20}]` }, children: [] });
  const f = path.join(dir, 't.json');
  writeFileSync(f, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [n('Body', 20, 200), n('Typing Predictions', 0, 500)] }));
  assert.equal(spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' }).status, 0);
});
