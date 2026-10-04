// Checks that a bar pinned to a page's foot keeps its button in the middle.
/**
 * Guard G-BB1 (owner, 2026-10-04: "Send code" should be in the middle of the white bar). The
 * root layout pads the iPhone's bottom strip once (app/_layout.tsx, guard G-T1). A bar that
 * pads it again, or pads its top and bottom differently, puts its button off-centre — five
 * bars did (auth pages, feedback, delete account, account "More", wallet). Pinned bars use
 * src/ui/kit/BottomBar.tsx, which has one vertical padding and no inset.
 *
 * The break that turns it red: put `pt-section pb-row` back on wallet.tsx's bar, or
 * `style={{ paddingBottom: insets.bottom }}` back on AuthShell's.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

const SOURCES = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))]
  // Comments are dropped: they may name what the code must not do.
  .map((path) => ({ file: relative(ROOT, path), text: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }));

/** Pages outside the root layout's padding: they pad their own bottom. */
const OWN_BOTTOM = new Set([
  'app/_layout.tsx', // the root itself
  'app/voice/new.tsx', // presentation: 'modal' — a native modal, outside the root's padding
  'src/ui/shell/LegalDoc.tsx', // inside a React Native Modal
]);

it('only the root and pages outside it pad the bottom inset', () => {
  const extra = SOURCES
    .filter((s) => !OWN_BOTTOM.has(s.file))
    .filter((s) => /edges=\{\['bottom'\]\}|insets\.bottom/.test(s.text))
    .map((s) => s.file);
  expect(extra).toEqual([]);
});

const SPACE: Record<string, number> = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, gap: 8, row: 12, section: 16 };

it('a bar with a top line pads its top and bottom the same', () => {
  const uneven: string[] = [];
  for (const s of SOURCES) {
    for (const m of s.text.matchAll(/className=["'`]([^"'`]*\bborder-t\b[^"'`]*)["'`]/g)) {
      const cls = m[1] ?? '';
      const top = /\bpt-([\w.]+)/.exec(cls)?.[1];
      const bottom = /\bpb-([\w.]+)/.exec(cls)?.[1];
      // Only both set is a bar's padding; a lone pt-* under a divider is spacing in a list.
      if (top === undefined || bottom === undefined) continue;
      if (SPACE[top] === undefined || SPACE[top] !== SPACE[bottom]) uneven.push(`${s.file}: ${cls}`);
    }
  }
  expect(uneven).toEqual([]);
});

it('BottomBar pads only with py-* and never adds an inset', () => {
  const bar = readFileSync(join(ROOT, 'src/ui/kit/BottomBar.tsx'), 'utf8');
  const pads = /const PAD = \{([^}]*)\}/.exec(bar)?.[1] ?? '';
  expect(pads).toMatch(/py-/);
  expect(pads).not.toMatch(/\bp[tb]-/);
  expect(bar).not.toMatch(/useSafeAreaInsets|SafeAreaView|paddingBottom/);
});
