import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { compare } from './action-replay.mjs';

const E = (file, name, destination = 'dynamic') => ({ surface: '/' + file, file, line: 1, role: 'button', name, destination });
const inv = (...entries) => ({ capturedAt: 'x', commit: 'x', entries });
const before = inv(E('a.tsx', 'Play', 'player.play'), E('a.tsx', 'Share', '/share'), E('b.tsx', 'Back', 'back'));

test('identical inventory passes', () => {
  const r = compare(before, before);
  assert.equal(r.missing.length, 0);
  assert.equal(r.pct, 100);
});

test('one button removed fails and names it', () => {
  const now = inv(E('a.tsx', 'Play', 'player.play'), E('b.tsx', 'Back', 'back'));
  const r = compare(before, now);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].name, 'Share');
  assert.equal(r.missing[0].file, 'a.tsx');
  assert.ok(r.pct < 100);
});

test('changed destination counts as missing; added buttons are fine', () => {
  const now = inv(E('a.tsx', 'Play', 'other'), E('a.tsx', 'Share', '/share'), E('b.tsx', 'Back', 'back'), E('b.tsx', 'New'));
  assert.deepEqual(compare(before, now).missing.map((m) => m.name), ['Play']);
});

test('a listed move with a reason passes; without a reason it fails', () => {
  const now = inv(E('a.tsx', 'Play', 'player.play'), E('b.tsx', 'Back', 'back'), E('c.tsx', 'Share', '/share'));
  const move = { file: 'a.tsx', name: 'Share', reason: 'moved into the new overflow sheet', via: ['c.tsx'], now: { file: 'c.tsx', name: 'Share', destination: '/share' } };
  const ok = compare(before, now, { moves: [move] });
  assert.equal(ok.missing.length, 0);
  assert.equal(compare(before, now, { moves: [{ ...move, reason: '' }] }).missing.length, 1);
  assert.equal(compare(before, now, { moves: [{ ...move, reason: '' }] }).problems.length, 1);
  // a listed move whose target does not exist still fails
  assert.equal(compare(before, inv(E('a.tsx', 'Play', 'player.play'), E('b.tsx', 'Back', 'back')), { moves: [move] }).missing.length, 1);
});

test('the CLI exits 1 on a removed button and 0 when identical', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'replay-'));
  const w = (n, o) => { const p = path.join(dir, n); writeFileSync(p, JSON.stringify(o)); return p; };
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'action-replay.mjs');
  const b = w('b.json', before);
  const args = (now) => [cli, '--before', b, '--now', now, '--moves', w('m.json', { moves: [] })];
  assert.equal(spawnSync('node', args(w('same.json', before))).status, 0);
  const r = spawnSync('node', args(w('less.json', inv(E('b.tsx', 'Back', 'back'), E('a.tsx', 'Play', 'player.play')))));
  assert.equal(r.status, 1);
  assert.match(r.stdout.toString(), /MISSING .*"Share"/);
});

// Review fix (L9): the inventory must see custom tappables such as BarButton (the Player's Clip was invisible).
test('the inventory reads BarButton, IconButton and a one-line SwitchRow with its own name', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'inv-'));
  mkdirSync(path.join(root, 'app'), { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'app/x.tsx'), [
    'export default function X() {',
    '  return (',
    '    <>',
    '      <BarButton label="Clip the last 30 seconds" onPress={clip}><Icon /></BarButton>',
    '      <SwitchRow icon="a" title="Skip silence" value={v} onChange={set} />',
    '      <Pressable onPress={go} accessibilityLabel="Neighbour" />',
    '    </>',
    '  );',
    '}',
  ].join('\n'));
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'action-inventory.mjs');
  const out = JSON.parse(execFileSync('node', [cli, '--root', root, '--commit', 'test']).toString());
  const names = out.entries.map((e) => `${e.name}|${e.destination}`);
  assert.deepEqual(names, ['Clip the last 30 seconds|clip', 'Skip silence|dynamic', 'Neighbour|go']);
});

// M31 blind-spot fix (phase 1, red first): a move must not hide a deletion.
const MV = (over = {}) => ({ file: 'app/p.tsx', name: 'Delete playlist', destination: 'remove', reason: 'approved: bin circle in the bottom bar',
  now: { file: 'src/ui/kit/TitleBar.tsx', name: 'a.label', destination: 'a.onPress' }, ...over });
const bPl = inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'), E('app/p.tsx', 'Delete playlist', 'remove'));
const titleBar = E('src/ui/kit/TitleBar.tsx', 'a.label', 'a.onPress');

test('(c) a move to the shared TitleBar line cannot excuse a screen whose own action list lost the item', () => {
  const now = inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'), titleBar);
  const r = compare(bPl, now, { moves: [MV()] });
  assert.deepEqual(r.missing.map((m) => m.name), ['Delete playlist']);
});

test('(b) a move is satisfied only by its `now` target in the same screen file (or a file the move names)', () => {
  const now = inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'), E('src/ui/other.tsx', 'Delete playlist', 'remove'));
  // target exists in the inventory, but in an unrelated file
  assert.equal(compare(bPl, now, { moves: [MV({ now: { file: 'src/ui/other.tsx', name: 'Delete playlist', destination: 'remove' } })] }).missing.length, 1);
  // control: the screen renamed the entry itself, inside its own file -> a recorded move passes
  const own = inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'), E('app/p.tsx', 'Remove playlist', 'remove'));
  assert.equal(compare(bPl, own, { moves: [MV({ now: { file: 'app/p.tsx', name: 'Remove playlist', destination: 'remove' } })] }).missing.length, 0);
});

test('(b) a move with no `now` target is rejected unless it says removed: true with a reason', () => {
  const now = inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'));
  const noNow = MV(); delete noNow.now;
  const r = compare(bPl, now, { moves: [noNow] });
  assert.equal(r.missing.length, 1, 'a move with neither `now` nor `removed` must not excuse a loss');
  const removed = compare(bPl, now, { moves: [{ ...noNow, removed: true }] });
  assert.equal(removed.missing.length, 0, 'removed: true with a reason is the one way to drop an action');
  assert.equal(compare(bPl, now, { moves: [{ ...noNow, removed: true, reason: '' }] }).missing.length, 1);
});

test('(b) the CLI exits 1 for a no-`now` move (and names the action) when the action is gone', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'replay-nonow-'));
  const w = (n, o) => { const p = path.join(dir, n); writeFileSync(p, JSON.stringify(o)); return p; };
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'action-replay.mjs');
  const noNow = MV(); delete noNow.now;
  const r = spawnSync('node', [cli, '--before', w('b.json', bPl), '--now', w('n.json', inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'))), '--moves', w('m.json', { moves: [noNow] })]);
  assert.equal(r.status, 1);
  assert.match(r.stdout.toString(), /MISSING .*"Delete playlist"/);
});

test('a move whose target is in a file named by `via` passes; `via` naming the shared TitleBar does not', () => {
  const now = inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'), E('src/ui/p/Sheet.tsx', 'Delete playlist', 'remove'), titleBar);
  const sheet = { file: 'app/p.tsx', name: 'Delete playlist', destination: 'remove', reason: 'approved: moved into the sheet', via: ['src/ui/p/Sheet.tsx'], now: { file: 'src/ui/p/Sheet.tsx', name: 'Delete playlist', destination: 'remove' } };
  assert.equal(compare(bPl, now, { moves: [sheet] }).missing.length, 0);
  assert.equal(compare(bPl, now, { moves: [{ ...sheet, via: [] }] }).missing.length, 1);
  const tb = { ...MV(), via: ['src/ui/kit/TitleBar.tsx'] };
  assert.equal(compare(bPl, inv(E('app/p.tsx', 'Rename playlist', 'setRenaming'), titleBar), { moves: [tb] }).missing.length, 1);
});
