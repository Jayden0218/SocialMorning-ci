// Checks that every bottom sheet leaves room for the iPhone home bar.
/**
 * M16a guard G-S1 (FR-009, gluestack audit P0): every bottom sheet clears the home indicator.
 * gluestack's ActionsheetContent pads its bottom with `pb-safe`, but UniWind's free engine only
 * knows the safe-area insets when the app hands them over (`Uniwind.updateInsets`, as the
 * upstream starter does with SafeAreaListener — docs.uniwind.dev/faq). Without it `pb-safe` was 0,
 * and the sheets carried guessed `pb-10` / `pb-24` instead (three had nothing at all).
 *
 * M25 lane GB: rendered where it can be. The hand-off is checked on the rendered root layout
 * (__tests__/root-layout.test.tsx: the listener's insets reach `Uniwind.updateInsets`); here an
 * open sheet is rendered after UniWind is told the insets, and its content must carry `pb-safe`
 * and be padded by the bottom inset. The last check stays a scan: it is a rule over every sheet
 * in the app (no caller may override the inset with a fixed bottom padding).
 *
 * The break that turns it red: remove the `updateInsets` listener (the <SafeAreaListener …>
 * around the app in app/_layout.tsx — root-layout.test.tsx goes red), or drop `pb-safe` from the
 * sheet base in src/ui/lib/actionsheet/index.tsx (this file goes red).
 */
// The gluestack sheets animate with @legendapp/motion (a setTimeout under jest): fake timers keep
// those inside the test (see sheets.test.tsx).
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Uniwind } from 'uniwind';
import { Actionsheet, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Text } from '@/ui/lib/text';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';

const ROOT = join(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'lib') walk(p, out); continue; }
    if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
};

// The root's hand-off (<SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>)
// is rendered in root-layout.test.tsx.

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

function openSheet(className: string): { r: ReactTestRenderer; content: ReactTestInstance } {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(GluestackUIProvider, null,
      createElement(Actionsheet, { isOpen: true, onClose: () => undefined },
        createElement(ActionsheetContent, { className }, createElement(Text, null, 'probe')))));
  });
  return { r, content: r.root.findAll((n) => n.type === ActionsheetContent)[0]! };
}

it('the sheet base pads by the inset: an open sheet carries `pb-safe`, and that is the bottom inset', () => {
  act(() => { Uniwind.updateInsets(INSETS); });
  try {
    // A caller's layout class (as RateSheet passes) does not drop the base's pb-safe.
    const { r, content } = openSheet('px-screen-x pt-gap items-stretch');
    const classed = content.findAll((n) => typeof n.props['className'] === 'string' && /(?:^|\s)pb-safe(?:\s|$)/.test(n.props['className'] as string));
    expect(classed.length).toBeGreaterThan(0);
    const pads = content.findAll((n) => typeof n.type === 'string')
      .map((n) => ((StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>)['paddingBottom']);
    expect(pads).toContain(INSETS.bottom);
    act(() => r.unmount());
  } finally {
    act(() => { Uniwind.updateInsets({ top: 0, bottom: 0, left: 0, right: 0 }); });
  }
});

// KEPT as a source scan: a rule over every <ActionsheetContent> in app/ and src/ (more than 50 files).
it('no sheet overrides the inset with a fixed bottom padding', () => {
  const offenders: string[] = [];
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<ActionsheetContent\b[^>]*className="([^"]*)"/g)) {
      // A bottom or all-sides padding on the caller would win over (or fight) the base's pb-safe.
      if (/(?:^|\s)(?:pb|p|py)-(?!safe)\S+/.test(m[1]!)) offenders.push(`${relative(ROOT, f).split(sep).join('/')}: ${m[1]}`);
    }
  }
  expect(files.length).toBeGreaterThan(50);
  expect(offenders).toEqual([]);
});
