// M31 blind-spot 2 (red first): a MOVED action must be checked at its target, and the screen that
// passes it to a kit part must still pass a real handler. Fixtures are tiny source trees in a temp dir
// (inventory run with --root, then the replay CLI); the last two cases break the real app in a copy.
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
  const root = mkdtempSync(path.join(tmpdir(), 'moved-'));
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
const replay = (beforeRoot, nowRoot, moves, cwd = MOBILE) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'moved-out-'));
  const w = (n, text) => { const p = path.join(dir, n); writeFileSync(p, text); return p; };
  const r = spawnSync(process.execPath, [REPLAY, '--before', w('b.json', inventory(beforeRoot)), '--now', w('n.json', inventory(nowRoot)), '--moves', w('m.json', JSON.stringify({ moves }))], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { status: r.status, out: r.stdout };
};

// Before: the screen owns the button. After: a kit part owns it and the screen passes the handler.
const BEFORE = {
  'app/p.tsx': `export default function P() {\n  return <Pressable onPress={() => queue.open()} accessibilityLabel="Playlist" />;\n}\n`,
};
const KIT = (label = 'Playlist') => `export function Bar(props: { onQueue: () => void }) {\n  return <Pressable onPress={props.onQueue} accessibilityLabel="${label}" />;\n}\n`;
const SCREEN = (attr) => `export default function P() {\n  return <Bar ${attr} />;\n}\n`;
const MOVE = {
  file: 'apps/mobile/app/p.tsx', name: 'Playlist', destination: 'queue.open', reason: 'approved: the bar owns the button',
  now: { file: 'apps/mobile/src/ui/kit/Bar.tsx', name: 'Playlist', destination: 'props.onQueue' },
  via: ['apps/mobile/src/ui/kit/Bar.tsx'],
};
const run = (screenAttr, kitLabel) => {
  const before = tree(BEFORE);
  const now = tree({ 'app/p.tsx': SCREEN(screenAttr), 'src/ui/kit/Bar.tsx': KIT(kitLabel) });
  try { return replay(before, now, [MOVE]); } finally { rmSync(before, { recursive: true, force: true }); rmSync(now, { recursive: true, force: true }); }
};

test('(4) intact: the kit part carries the label and the screen passes the real handler -> GREEN', () => {
  const r = run('onQueue={() => queue.open()}');
  assert.equal(r.status, 0, r.out);
});

test('(1) the target kit part lost the label -> RED', () => {
  const r = run('onQueue={() => queue.open()}', 'Queue');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /MISSING .*"Playlist"/);
});

test('(2) the screen passes an empty handler `() => {}` -> RED naming the action', () => {
  const r = run('onQueue={() => {}}');
  assert.equal(r.status, 1, 'a no-op handler must not count as the moved action\n' + r.out);
  assert.match(r.out, /MISSING .*"Playlist"/);
});

test('(2b) the screen passes `undefined`, `null` or a bare `noop` -> RED', () => {
  for (const h of ['onQueue={undefined}', 'onQueue={null}', 'onQueue={() => undefined}', 'onQueue={() => null}']) {
    assert.equal(run(h).status, 1, h);
  }
});

test('(3) the screen no longer passes the prop at all -> RED', () => {
  const r = run('');
  assert.equal(r.status, 1, 'a removed prop must not count as the moved action\n' + r.out);
  assert.match(r.out, /MISSING .*"Playlist"/);
});

test('(5) the screen passes a handler that goes somewhere else than the recorded destination -> RED', () => {
  const r = run('onQueue={() => other.thing()}');
  assert.equal(r.status, 1, 'the handler must still reach the move destination\n' + r.out);
});

test('(6) a handler that is a named function or a spread of props is still a real handler -> GREEN', () => {
  assert.equal(run('onQueue={() => queue.open()}').status, 0);
  // same destination written as a plain reference: `queue.open`
  assert.equal(run('onQueue={queue.open}').status, 0);
});

// ---- the real app, in a copy -------------------------------------------------------------------
const breakCopy = (rel, from, to) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'moved-real-'));
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

test('real tree: the now-bar Playlist button turned into onQueue={() => {}} -> RED', () => {
  const r = breakCopy('src/ui/player/MiniPlayer.tsx', 'onQueue={() => queueSheet.open()}', 'onQueue={() => {}}');
  assert.equal(r.status, 1, r.out.split('\n').slice(-4).join('\n'));
  assert.match(r.out, /MISSING .*Playlist/);
});

test('real tree: collected.tsx loses the sheet onClose -> RED', () => {
  const r = breakCopy('app/settings/collected.tsx', 'onClose={() => setOpen(undefined)} ', '');
  assert.equal(r.status, 1, r.out.split('\n').slice(-4).join('\n'));
  assert.match(r.out, /MISSING .*Close/);
});

test('real tree, control: an untouched copy replays GREEN', () => {
  const r = breakCopy('src/ui/player/MiniPlayer.tsx', 'onQueue={() => queueSheet.open()}', 'onQueue={() => queueSheet.open()} ');
  assert.equal(r.status, 0, r.out.split('\n').slice(-4).join('\n'));
});
