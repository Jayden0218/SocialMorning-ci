/**
 * The file maps stay true (owner, 2026-10-03: "easy to read, easy to find"). `src/README.md`
 * and `app/README.md` give every file one plain line. A map that misses a file, or names one
 * that is gone, sends the reader to the wrong place — so both directions are checked.
 *
 * The break that turns it red: delete one row from src/README.md (or add a file to src/
 * without a row).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..');

function files(dir: string, skip: string[] = []): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return skip.includes(p) ? [] : files(p, skip);
    return /\.tsx?$/.test(name) ? [relative(ROOT, p).split(sep).join('/')] : [];
  });
}

/** Rows under each `### \`folder/\`` heading → `folder/file` (a row may already carry the folder). */
function listed(readme: string, base: string): string[] {
  let folder = '';
  const out: string[] = [];
  for (const line of readFileSync(join(ROOT, readme), 'utf8').split('\n')) {
    const h = /^### `([^`]+\/)`/.exec(line);
    if (h) { folder = h[1]!; continue; }
    if (/^### /.test(line)) { folder = ''; continue; }
    const row = /^\| `([^`]+)` \|/.exec(line);
    if (row && row[1] !== 'File') out.push(`${base}/${row[1]!.startsWith(folder) ? '' : folder}${row[1]}`);
  }
  return out;
}

it('src/README.md lists every file in src/ (except ui/lib), and nothing else', () => {
  const have = files(join(ROOT, 'src'), [join(ROOT, 'src', 'ui', 'lib')]).sort();
  const map = listed('src/README.md', 'src').sort();
  expect(map.filter((f) => !have.includes(f))).toEqual([]);
  expect(have.filter((f) => !map.includes(f))).toEqual([]);
});

it('app/README.md lists every screen file in app/, and nothing else', () => {
  const have = files(join(ROOT, 'app')).sort();
  const map = listed('app/README.md', 'app').sort();
  expect(map.filter((f) => !have.includes(f))).toEqual([]);
  expect(have.filter((f) => !map.includes(f))).toEqual([]);
});
