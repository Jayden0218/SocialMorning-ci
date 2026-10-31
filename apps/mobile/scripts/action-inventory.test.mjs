// M31 blind-spot fix (phase 1, red first): the inventory must also read actions that a screen passes
// to a kit part as data, e.g. `actions: [{ icon, label: 'Delete playlist', onPress: remove }]`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'action-inventory.mjs');
const run = (files) => {
  const root = mkdtempSync(path.join(tmpdir(), 'inv-arr-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  mkdirSync(path.join(root, 'src'), { recursive: true });
  return JSON.parse(execFileSync('node', [cli, '--root', root, '--commit', 'test']).toString()).entries;
};

const PLAYLIST = [
  'export default function P() {',
  '  return (',
  '    <PushedPage',
  '      title="x"',
  '      {...(mine ? {',
  '        actions: [',
  "          { icon: 'pencil-outline' as const, label: 'Rename playlist', onPress: () => setRenaming(t) },",
  "          { icon: 'trash-outline' as const, label: 'Delete playlist', onPress: remove },",
  '        ],',
  '      } : {})}',
  '    />',
  '  );',
  '}',
].join('\n');

test('an action object inside an `actions` array is listed under its screen with its own label', () => {
  const e = run({ 'app/playlists/[id].tsx': PLAYLIST });
  const del = e.find((x) => x.name === 'Delete playlist');
  assert.ok(del, `Delete playlist not in the inventory: ${JSON.stringify(e.map((x) => x.name))}`);
  assert.equal(del.surface, '/playlists/[id]');
  assert.equal(del.file, 'apps/mobile/app/playlists/[id].tsx');
  assert.equal(del.destination, 'remove');
  assert.ok(e.some((x) => x.name === 'Rename playlist' && x.surface === '/playlists/[id]'));
});

test('extra / rows / items style array props are read too, and a plain array of non-actions is not', () => {
  const e = run({
    'app/y.tsx': [
      'export default function Y() {',
      '  return <Sheet',
      "    extra={[{ label: 'Share it', onPress: share }]}",
      '    rows={[',
      "      { title: 'Mute show', onPress: () => mute() },",
      "      { title: 'Report', onPress: report },",
      '    ]}',
      "    tags={[{ label: 'Not an action' }]}",
      '  />;',
      '}',
    ].join('\n'),
  });
  assert.deepEqual(e.map((x) => x.name).sort(), ['Mute show', 'Report', 'Share it']);
});

test('removing the object from the array removes it from the inventory (the guard can see a deletion)', () => {
  const e = run({ 'app/playlists/[id].tsx': PLAYLIST.split('\n').filter((l) => !l.includes('Delete playlist')).join('\n') });
  assert.ok(!e.some((x) => x.name === 'Delete playlist'));
  assert.ok(e.some((x) => x.name === 'Rename playlist'));
});
