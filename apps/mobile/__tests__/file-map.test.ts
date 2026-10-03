// Checks that every file map lists exactly the real files, and each file's top line matches its row.
/**
 * The file maps stay true (owner, 2026-10-03: "easy to read, easy to find"). Each map gives every
 * code file one plain line, and each file starts with the same sentence as a `//` comment. A map
 * that misses a file, names one that is gone, or says something different from the file itself
 * sends the reader to the wrong place — so all three are checked, for every map in the repo.
 *
 * The break that turns it red: delete one row from a map, or change one file's top line.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const MOBILE = join(__dirname, '..');
const REPO = join(MOBILE, '..', '..');

function files(dir: string, skip: string[] = []): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return skip.includes(p) || name === 'node_modules' ? [] : files(p, skip);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [relative(REPO, p).split(sep).join('/')] : [];
  });
}

/** File rows under each `### \`folder/\`` heading → { path, line } (a row may already carry the folder). */
function listed(readme: string, base: string): Map<string, string> {
  let folder = '';
  const out = new Map<string, string>();
  for (const line of readFileSync(join(REPO, readme), 'utf8').split('\n')) {
    const h = /^### `([^`]+\/)`/.exec(line);
    if (h) { folder = h[1]!; continue; }
    if (/^### /.test(line)) { folder = ''; continue; }
    const row = /^\| `([^`]+\.tsx?)` \|(.*)\|$/.exec(line);
    if (!row) continue;
    // The description is the last cell (the screen map has a Route column before it).
    const desc = row[2]!.split(/(?<!\\)\|/).pop()!.trim().replace(/\\\|/g, '|');
    out.set(`${base}/${row[1]!.startsWith(folder) ? '' : folder}${row[1]}`, desc);
  }
  return out;
}

/** The file's own plain line: its first line, or the second after a `#!` or an environment pragma. */
function topLine(path: string): string {
  const [a = '', b = ''] = readFileSync(join(REPO, path), 'utf8').split('\n');
  return /^(#!|\/\/ @(vitest|jest)-environment)/.test(a) ? b : a;
}

const MAPS: { readme: string; base: string; dirs: string[]; skip?: string[] }[] = [
  { readme: 'apps/mobile/src/README.md', base: 'apps/mobile/src', dirs: ['apps/mobile/src'], skip: ['apps/mobile/src/ui/lib'] },
  { readme: 'apps/mobile/app/README.md', base: 'apps/mobile/app', dirs: ['apps/mobile/app'] },
  { readme: 'apps/studio/src/README.md', base: 'apps/studio/src', dirs: ['apps/studio/src'] },
  { readme: 'apps/api/src/README.md', base: 'apps/api/src', dirs: ['apps/api/src'] },
  { readme: 'packages/README.md', base: 'packages', dirs: ['packages/feed-parser/src', 'packages/player-core/src', 'packages/social-core/src'] },
];

describe.each(MAPS)('$readme', ({ readme, base, dirs, skip = [] }) => {
  const have = dirs.flatMap((d) => (existsSync(join(REPO, d)) ? files(join(REPO, d), skip.map((s) => join(REPO, s))) : [])).sort();
  const map = listed(readme, base);

  it('lists every code file, and nothing else', () => {
    expect([...map.keys()].filter((f) => !have.includes(f))).toEqual([]);
    expect(have.filter((f) => !map.has(f))).toEqual([]);
  });

  it("each file's top line is its row, word for word", () => {
    const differ = have.filter((f) => map.has(f) && topLine(f) !== `// ${map.get(f)}`).map((f) => `${f}: "${topLine(f)}" ≠ "// ${map.get(f)}"`);
    expect(differ).toEqual([]);
  });
});
