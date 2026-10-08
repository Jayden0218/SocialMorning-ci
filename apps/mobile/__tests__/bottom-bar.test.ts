// Checks that a bar pinned to a page's foot keeps its button in the middle.
/**
 * Guard G-BB1 (owner, 2026-10-04: "Send code" should be in the middle of the white bar). The
 * root layout pads the iPhone's bottom strip once (app/_layout.tsx, guard G-T1). A bar that
 * pads it again, or pads its top and bottom differently, puts its button off-centre — five
 * bars did (auth pages, feedback, delete account, account "More", wallet). Pinned bars use
 * src/ui/kit/BottomBar.tsx, which has one vertical padding and no inset.
 *
 * The break that turns it red: put `pt-section pb-row` back on wallet.tsx's bar, or
 * `style={{ paddingBottom: insets.bottom }}` back on AuthShell's (the two source scans), or give
 * BottomBar itself a `pt-*` / `pb-*` or a safe-area inset (the render test at the end).
 *
 * The first two tests stay source scans: each is a rule over every .tsx file in app/ and src/.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { BottomBar } from '@/ui/kit/BottomBar';

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
  'src/ui/shell/Terms.tsx', // drawn by AppProviders, outside the root's padding: its bar centres itself over the strip
  'app/player.tsx', // owner 2026-10-06: the root leaves its strip to the player, whose wash reaches the bottom edge
  'src/ui/player/SettingsPanel.tsx', // M21 US2: full-screen panel over the player (which pads its own bottom), so it pads its own too
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

/**
 * BottomBar itself, rendered: inside a 34 pt bottom inset (an iPhone's home strip), every `pad`
 * gives the same space above and below, and nothing in the bar takes up the inset. A bar that
 * read `useSafeAreaInsets()` or wrapped itself in a SafeAreaView would put 34 below its button.
 */
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const vertical = (s: Record<string, unknown>): [number, number] => [
  Number(s['paddingTop'] ?? s['paddingVertical'] ?? s['padding'] ?? 0),
  Number(s['paddingBottom'] ?? s['paddingVertical'] ?? s['padding'] ?? 0),
];

it.each([['none', 0], ['row', 12], ['section', 16]] as const)('BottomBar pad="%s": %d pt above and below, and never adds the inset', (pad, pt) => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } },
      createElement(BottomBar, { tone: 'surface', pad, className: 'flex-row gap-row', children: createElement(Text, { testID: 'inside' }, 'Send code') })));
  });
  const hosts = r.root.findAll((n) => typeof n.type === 'string');
  expect(vertical(flat(hosts[0]!.props['style']))).toEqual([pt, pt]);
  // From the bar down to what it holds: no inset view and no uneven padding anywhere.
  const inside = hosts.findIndex((n) => n.props['testID'] === 'inside');
  expect(inside).toBeGreaterThan(0);
  for (const n of hosts.slice(0, inside)) {
    const [top, bottom] = vertical(flat(n.props['style']));
    expect([top, bottom]).not.toContain(34);
    expect(top).toBe(bottom);
  }
  act(() => r.unmount());
});
