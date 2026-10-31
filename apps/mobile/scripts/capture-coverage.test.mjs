// Tests for the capture-coverage guard (M27): each kind of finding must come out red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from './capture-coverage.mjs';
import { scan } from './capture-sites.mjs';

const site = (id, kind = 'route') => { const [file, , key] = id.split('::'); return { id, file, kind, key, line: 1 }; };
const entry = (over = {}) => ({ name: 'a--b', area: 'x', kind: 'screen', covers: ['app/a.tsx::route'], as: 'listener', steps: [{ open: '/a' }], design: null, status: 'CAPTURE', _file: 't.json', ...over });

test('a clean inventory has no findings', () => {
  assert.deepEqual(check([site('app/a.tsx::route::route')], [entry({ covers: ['app/a.tsx::route::route'] })], []), []);
});
test('a code site with no entry is NEW', () => {
  const p = check([site('app/a.tsx::route::route'), site('app/b.tsx::route::route')], [entry({ covers: ['app/a.tsx::route::route'] })], []);
  assert.equal(p.length, 1); assert.match(p[0], /^NEW: app\/b\.tsx:1 route/);
});
test('an entry whose code is gone is STALE', () => {
  const p = check([], [entry({ covers: ['app/gone.tsx::route::route'] })], []);
  assert.ok(p.some((x) => x.startsWith('STALE:') && x.includes('gone.tsx')));
});
test('malformed entries are BAD', () => {
  const p = check([site('app/a.tsx::route::route')], [entry({ covers: ['app/a.tsx::route::route'], name: 'Bad Name', as: 'ghost', status: 'EXCLUDED', steps: undefined })], []);
  assert.ok(p.some((x) => /file-safe/.test(x)) && p.some((x) => /account "ghost"/.test(x)) && p.some((x) => /no reason/.test(x)));
});
test('too many non-capture entries trips the 5 % limit', () => {
  const es = [entry({ covers: ['a'] }), entry({ name: 'c', covers: ['a'], status: 'EXCLUDED', reason: 'r' })];
  assert.ok(check([site('a::route::route')], es, []).some((x) => x.startsWith('RATIO')));
});
test('the reader finds every kind in the real code', () => {
  const s = scan();
  const kinds = new Set(s.map((x) => x.kind));
  for (const k of ['route', 'sheet', 'dialog', 'toast', 'empty', 'surface', 'permission', 'system']) assert.ok(kinds.has(k), k);
  assert.equal(s.filter((x) => x.kind === 'route').length, 105);
  assert.ok(s.some((x) => x.id === 'src/ui/queue/QueueSheet.tsx::dialog::Clear the playlist?'));
});
test('the reader counts the M31 kit <ActionSheet> and <Dialog> uses, not their definitions', () => {
  const ids = scan().map((x) => x.id);
  assert.ok(ids.includes('src/ui/player/MoonButton.tsx::sheet::#1'));
  assert.ok(ids.includes('src/ui/me/SignOut.tsx::dialog::Sign out?'));
  assert.ok(!ids.some((i) => i.startsWith('src/ui/kit/ActionSheet.tsx::') || i.startsWith('src/ui/kit/Dialog.tsx::')));
});
