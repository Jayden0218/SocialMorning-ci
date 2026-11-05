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
  assert.match(r.stdout, /5 distinct left edges/);
});

test('a -bleed element, the tab bar and the status bar are exempt', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'edges-'));
  const n = (l, x, y, id = '') => ({ attributes: { text: l, 'resource-id': id, bounds: `[${x},${y}][${x + 100},${y + 20}]` }, children: [] });
  const f = path.join(dir, 't.json');
  writeFileSync(f, JSON.stringify({ attributes: { bounds: '[0,0][390,844]' }, children: [n('9:41', 5, 10), n('Hero', 0, 100, 'hero-bleed'), n('Body', 20, 200), n('Home', 5, 790, 'tab-home')] }));
  assert.equal(spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' }).status, 0);
});
