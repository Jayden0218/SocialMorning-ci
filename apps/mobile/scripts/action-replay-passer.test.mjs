// M31 blind-spot 3 (red first): a move WITHOUT `via` whose target is a kit/row part's own `props.onX`
// (the moved action lives in the part's file, so `file === now.file`) must still be checked at the
// screen that passes the prop to that part. Fixtures are tiny trees; the last cases break the real app in a copy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.join(HERE, '..');
const INV = path.join(HERE, 'action-inventory.mjs');
const REPLAY = path.join(HERE, 'action-replay.mjs');

const tree = (files) => {
  const root = mkdtempSync(path.join(tmpdir(), 'passer-'));
  for (const d of ['app', 'src']) mkdirSync(path.join(root, d), { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
};
const inventory = (root) => {
  const r = spawnSync(process.execPath, [INV, '--root', root, '--commit', 'x'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const replay = (beforeRoot, nowRoot, moves) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'passer-out-'));
  const w = (n, text) => { const p = path.join(dir, n); writeFileSync(p, text); return p; };
  const r = spawnSync(process.execPath, [REPLAY, '--before', w('b.json', inventory(beforeRoot)), '--now', w('n.json', inventory(nowRoot)), '--moves', w('m.json', JSON.stringify({ moves }))], { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { status: r.status, out: r.stdout };
};

// Before: the row has a swipe action "Queue". After: the row has a card button; the screen passes onQueue.
const ROW_BEFORE = `export function Row(props: { onQueue: () => void }) {\n  return <Swipe actions={[{ label: 'Queue', onPress: props.onQueue }]} />;\n}\n`;
const ROW_NOW = `export function Row(props: { onQueue: () => void }) {\n  return <Pressable onPress={props.onQueue} accessibilityLabel="Add to the queue" />;\n}\n`;
const SCREEN = (attr) => `export default function P() {\n  return <Row ${attr} />;\n}\n`;
const MOVE = {
  file: 'apps/mobile/src/ui/ep/Row.tsx', name: 'Queue', destination: 'props.onQueue', reason: 'approved: the card button replaces the swipe',
  now: { file: 'apps/mobile/src/ui/ep/Row.tsx', name: 'Add to the queue', destination: 'props.onQueue' },
};
const run = (screenAttr, rowNow = ROW_NOW, move = MOVE) => {
  const before = tree({ 'src/ui/ep/Row.tsx': ROW_BEFORE, 'app/p.tsx': SCREEN('onQueue={() => queue(e.id)}') });
  const now = tree({ 'src/ui/ep/Row.tsx': rowNow, 'app/p.tsx': SCREEN(screenAttr) });
  try { return replay(before, now, [move]); } finally { rmSync(before, { recursive: true, force: true }); rmSync(now, { recursive: true, force: true }); }
};

test('(1) intact: the row carries the new button and the screen passes a real handler -> GREEN', () => {
  const r = run('onQueue={() => queue(e.id)}');
  assert.equal(r.status, 0, r.out);
});

test('(2) the screen passes `() => {}` to a move without via -> RED naming Queue', () => {
  const r = run('onQueue={() => {}}');
  assert.equal(r.status, 1, 'an empty handler at the passer must not count\n' + r.out);
  assert.match(r.out, /MISSING .*"Queue"/);
});

test('(3) the screen no longer passes the prop -> RED', () => {
  const r = run('');
  assert.equal(r.status, 1, 'a removed prop must not count\n' + r.out);
  assert.match(r.out, /MISSING .*"Queue"/);
});

test('(4) undefined / null / () => undefined handlers -> RED', () => {
  for (const h of ['onQueue={undefined}', 'onQueue={null}', 'onQueue={() => undefined}']) assert.equal(run(h).status, 1, h);
});

test('(5) the row lost the new button (target missing) -> RED (already caught today)', () => {
  const r = run('onQueue={() => queue(e.id)}', ROW_NOW.replace('Add to the queue', 'Something else'));
  assert.equal(r.status, 1, r.out);
});

test('(6) a screen that spreads props into the row cannot be proven empty -> GREEN', () => {
  const r = run('{...rowProps}');
  assert.equal(r.status, 0, r.out);
});

// ---- the real app, in a copy -------------------------------------------------------------------
const breakCopy = (rel, from, to) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'passer-real-'));
  try {
    for (const d of ['app', 'src']) cpSync(path.join(MOBILE, d), path.join(tmp, d), { recursive: true, filter: (s) => !s.includes('node_modules') });
    const f = path.join(tmp, rel);
    const src = readFileSync(f, 'utf8');
    const cut = src.replace(from, to);
    assert.notEqual(cut, src, 'the edit must change the copy');
    writeFileSync(f, cut);
    const nowFile = path.join(tmp, 'now.json');
    writeFileSync(nowFile, inventory(tmp));
    const r = spawnSync(process.execPath, [REPLAY, '--now', nowFile], { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1 << 26 });
    return { status: r.status, out: r.stdout };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
};

test('real tree: library.tsx onQueue={() => {}} -> RED naming Queue', () => {
  const r = breakCopy('app/(tabs)/library.tsx', 'onQueue={() => queue(e.id)}', 'onQueue={() => {}}');
  assert.equal(r.status, 1, r.out.split('\n').slice(-4).join('\n'));
  assert.match(r.out, /MISSING .*"Queue"/);
});

test('real tree, control: an untouched copy replays GREEN', () => {
  const r = breakCopy('app/(tabs)/library.tsx', 'onQueue={() => queue(e.id)}', 'onQueue={() => queue(e.id)} ');
  assert.equal(r.status, 0, r.out.split('\n').slice(-4).join('\n'));
});
