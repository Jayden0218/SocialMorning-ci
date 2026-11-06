// Spec 039 Q8: row M has ONE accent. `violet` is used only where it is data, in the files listed here.
/**
 * Owner, 2026-11-06 (Q8): violet's accent uses move to the accent tokens (`hot`, `hotText`, `hotSoft`) or a neutral (`text2`, `line`).
 * This reads every .ts/.tsx under src/ and app/ (tests excluded) for violet in CODE: `colour.violet`, a class such as `bg-violet` or
 * `border-violet/40`, or its hex as a quoted string. A file outside ALLOWED that does so turns it red. Each allowed file says why:
 *  - src/design/tokens.ts: the token is defined here (and nowhere else);
 *  - src/ui/player/PlayerRing.tsx: a comment pin's colour tells commenters apart (green, blue, violet, hot), which is data, not a second accent;
 *  - src/ui/comments/CommentsMap.tsx: the live discs on the comments map tell up to three listeners apart, which is data, not a second accent.
 * Break to watch red: write `colour.violet` or `bg-violet` into any other file under src/ui/ (seen red once with the allow-list at tokens.ts alone:
 * PlayerRing and CommentsMap were reported; then restored).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const ALLOWED = new Set(['src/design/tokens.ts', 'src/ui/player/PlayerRing.tsx', 'src/ui/comments/CommentsMap.tsx']);
const CODE_FORMS = [/colour\.violet\b/, /\b(?:bg|text|border|fill|stroke|ring|from|to|via|shadow|outline|decoration)-violet\b/, /['"]#7a3cff['"]/i];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

it('uses violet in code only in the allowed files', () => {
  const found: string[] = [];
  for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))]) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // code only: notes may name the colour
    if (CODE_FORMS.some((re) => re.test(text))) found.push(relative(ROOT, file));
  }
  expect(found.sort()).toEqual([...ALLOWED].sort());
});
