import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RETIRED_MODULES, RETIRED_PARTS, RETIRED_PATTERNS, findRetired, revived } from './retired-check.mjs';

const f = (file, text) => ({ file, text });

test('a clean tree has no findings', () => {
  assert.deepEqual(findRetired([f('app/a.tsx', "import { Box } from '@/ui/lib/box';\nimport { TitleBar } from '@/ui/kit/TitleBar';")]), []);
});

test('an import of a retired part is named with its file and line, however it is spelled', () => {
  const r = findRetired([
    f('app/a.tsx', "import x from 'y';\nimport { HeatScrubber } from '@/ui/player/HeatScrubber';"),
    f('src/b.tsx', "import { SheetRow } from '../kit/SheetRow';"),
    f('src/c.tsx', "const T = require('@/ui/kit/TintedPage');"),
    f('src/d.tsx', "const P = await import('@/ui/kit/HeatScrubber');"),
  ]);
  assert.equal(r.length, 4);
  assert.match(r[0], /^app\/a\.tsx:2 imports retired HeatScrubber/);
});

test('the retired hand-built Actionsheet module is refused; its own folder and comments are not', () => {
  const [mod] = RETIRED_MODULES;
  assert.equal(findRetired([f('src/ui/x/Sheet.tsx', `import { Actionsheet } from '${mod.module}';`)]).length, 1);
  assert.equal(findRetired([f('src/ui/x/Sheet.tsx', `import { Actionsheet } from '${mod.module}/index';`)]).length, 1);
  assert.deepEqual(findRetired([f('src/ui/lib/actionsheet/index.tsx', `import { y } from '${mod.module}/extra';`)]), []);
  assert.deepEqual(findRetired([f('src/ui/x/Sheet.tsx', `// was: import { Actionsheet } from '${mod.module}';`)]), []);
});

test('a retired part\'s own file is not its importer', () => {
  const p = RETIRED_PARTS[0];
  assert.deepEqual(findRetired([f(p.file, `import { x } from './${p.name}';`)]), []);
});

test('a retired file that comes back is reported', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'retired-'));
  assert.deepEqual(revived(root), []);
  const p = RETIRED_PARTS[1];
  mkdirSync(path.dirname(path.join(root, p.file)), { recursive: true });
  writeFileSync(path.join(root, p.file), '');
  assert.equal(revived(root).length, 1);
});

test('T101: the deleted Editorial variants and old size names are refused where they would come back', () => {
  assert.equal(findRetired([f('src/ui/kit/Segmented.tsx', "const LOOK = { yellow: {} };")]).length, 1);
  assert.deepEqual(findRetired([f('src/ui/x/Other.tsx', "const LOOK = 1;")]), []);
  assert.equal(findRetired([f('app/a.tsx', '<Segmented items={x} value={v} onChange={c} tone="dark" />')]).length, 1);
  assert.equal(findRetired([f('app/a.tsx', '<Text className="text-lead text-text">')]).length, 1);
  assert.equal(findRetired([f('app/a.tsx', '<Text className="text-md">')]).length, 1);
  assert.equal(findRetired([f('src/design/tokens.ts', 'micro: 11, lead: 15, sm: 16')]).length, 1);
  // names that merely start the same, comments and the vendored library are not findings
  assert.deepEqual(findRetired([f('app/a.tsx', '<Text className="text-mdx text-leading text-pulse-body">')]), []);
  assert.deepEqual(findRetired([f('app/a.tsx', '// text-lead was 15 px')]), []);
  assert.deepEqual(findRetired([f('src/ui/lib/text/styles.tsx', "md: 'text-md'")]), []);
  assert.ok(RETIRED_PATTERNS.length >= 5);
});
