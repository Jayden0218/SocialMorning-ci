import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// 039 T030 (tightened 2026-11-06: PushedPage is the OLD frame and no longer counts; a wrapper from src/ counts when it is itself on Page/PageList). A temp app/ with one framed page, one unframed page and a layout: the count is 1 and green against a baseline of 1;
// adding a second unframed page turns it red, and --write refuses to raise the baseline.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'page-frame-check.mjs');
const FRAMED = `import { Page } from '@/ui/kit/layout';\nexport default function A() { return <Page title="A" />; }\n`;
const PUSHED = `import { PushedPage } from '@/ui/kit/PushedPage';\nexport default function B() { return <PushedPage title="B">{null}</PushedPage>; }\n`;
const LIST = `import { PageList } from '@/ui/kit/layout';\nexport default function L() { return <PageList title="L" data={[]} renderItem={() => null} />; }\n`;
const WRAPPED = `import { Wrapper } from '@/ui/wrap';\nexport default function W() { return <Wrapper title="W" />; }\n`;
const WRAPPED_OLD = `import { OldWrapper } from '@/ui/oldwrap';\nexport default function O() { return <OldWrapper />; }\n`;
const BARE = `import { Box } from '@/ui/lib/box';\nexport default function C() { return <Box />; }\n`;
const REDIRECT = `import { Redirect } from 'expo-router';\nexport default function R() { return <Redirect href="/x" />; }\n`;

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pageframe-'));
  mkdirSync(path.join(root, 'app', 'sub'), { recursive: true });
  const put = (f, t) => writeFileSync(path.join(root, 'app', f), t);
  put('a.tsx', FRAMED); put('b.tsx', PUSHED); put('sub/c.tsx', BARE); put('r.tsx', REDIRECT);
  put('_layout.tsx', BARE);
  put('l.tsx', LIST);
  mkdirSync(path.join(root, 'src', 'ui'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'ui', 'wrap.tsx'), FRAMED.replace('function A', 'function Wrapper'));
  writeFileSync(path.join(root, 'src', 'ui', 'oldwrap.tsx'), PUSHED.replace('function B', 'function OldWrapper'));
  put('w.tsx', WRAPPED);
  put('o.tsx', WRAPPED_OLD);
  writeFileSync(path.join(root, 'baseline.json'), JSON.stringify({ unframed: 3, files: ['app/b.tsx', 'app/o.tsx', 'app/sub/c.tsx'] }));
  return { root, put, baseline: path.join(root, 'baseline.json') };
}
const run = (f, ...x) => spawnSync(process.execPath, [SCRIPT, '--root', f.root, '--baseline', f.baseline, ...x], { encoding: 'utf8' });

test('Page, PageList and a wrapper built on them are framed; PushedPage, a wrapper on PushedPage and a bare page are not; layouts and pure redirects are not pages', () => {
  const f = fixture();
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /3 unframed \(baseline 3\), 3 framed/);
});

test('a page on PushedPage alone is red against a baseline that does not list it', () => {
  const f = fixture();
  writeFileSync(f.baseline, JSON.stringify({ unframed: 2, files: ['app/o.tsx', 'app/sub/c.tsx'] }));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /app\/b\.tsx/);
});

test('a NEW unframed page is red and named', () => {
  const f = fixture();
  f.put('sub/new.tsx', BARE);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /app\/sub\/new\.tsx/);
});

test('--write refuses to raise the baseline, lowers it when a page is framed', () => {
  const f = fixture();
  f.put('sub/new.tsx', BARE);
  assert.equal(run(f, '--write').status, 1);
  f.put('sub/new.tsx', FRAMED);
  f.put('sub/c.tsx', FRAMED);
  f.put('b.tsx', FRAMED);
  f.put('o.tsx', FRAMED);
  const low = run(f);
  assert.equal(low.status, 0);
  assert.match(low.stdout, /went down/);
  assert.equal(run(f, '--write').status, 0);
  assert.equal(JSON.parse(readFileSync(f.baseline, 'utf8')).unframed, 0);
});

// 039 I1 (D8, revised): a wrapper may sit up to 4 levels above Page (SetPage -> SettingsPage -> Page); an EXEMPT page (scripts/page-frame-exempt.json, a reason each) is not counted but is listed.
test('a page framed through a two-level wrapper chain counts as framed', () => {
  const f = fixture();
  writeFileSync(path.join(f.root, 'src', 'ui', 'mid.tsx'), `import { Wrapper } from '@/ui/wrap';\nexport function Mid() { return <Wrapper title="m" />; }\n`);
  f.put('two.tsx', `import { Mid } from '@/ui/mid';\nexport default function T() { return <Mid />; }\n`);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /3 unframed \(baseline 3\), 4 framed/);
});

test('a wrapper chain deeper than 4 levels is not followed', () => {
  const f = fixture();
  const ui = path.join(f.root, 'src', 'ui');
  writeFileSync(path.join(ui, 'c1.tsx'), `import { Wrapper } from '@/ui/wrap';\nexport function C1() { return <Wrapper />; }\n`);
  for (const [a, b] of [['c2', 'C1'], ['c3', 'C2'], ['c4', 'C3'], ['c5', 'C4']]) {
    const prev = b.toLowerCase();
    writeFileSync(path.join(ui, a + '.tsx'), `import { ${b} } from '@/ui/${prev}';\nexport function ${a.toUpperCase()}() { return <${b} />; }\n`);
  }
  f.put('deep.tsx', `import { C5 } from '@/ui/c5';\nexport default function D() { return <C5 />; }\n`);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /app\/deep\.tsx/);
});

test('an exempt page is not counted as unframed but is listed with its reason', () => {
  const f = fixture();
  f.put('stage.tsx', BARE);
  const exempt = path.join(f.root, 'exempt.json');
  writeFileSync(exempt, JSON.stringify({ 'app/stage.tsx': 'fixed stage; owner decision' }));
  const without = run(f);
  assert.equal(without.status, 1, 'no exempt list: the page is a new unframed page');
  const r = run(f, '--exempt', exempt);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /3 unframed \(baseline 3\)/);
  assert.match(r.stdout, /exempt: app\/stage\.tsx — fixed stage; owner decision/);
});

test('a generic wrapper or frame (<FeedPage<Row> ...>, <PageList<T> ...>) is framed too', () => {
  const f = fixture();
  writeFileSync(path.join(f.root, 'src', 'ui', 'gen.tsx'), `import { PageList } from '@/ui/kit/layout';\nexport function Gen<T>() { return <PageList<T> title="g" data={[]} renderItem={() => null} />; }\n`);
  f.put('g.tsx', `import { Gen } from '@/ui/gen';\nexport default function G() { return <Gen<number> />; }\n`);
  f.put('h.tsx', `import { PageList } from '@/ui/kit/layout';\nexport default function H() { return <PageList<number> title="h" data={[]} renderItem={() => null} />; }\n`);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /3 unframed \(baseline 3\), 5 framed/);
});
