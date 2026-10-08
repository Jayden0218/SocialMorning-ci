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
 * open sheet is rendered and its content must carry `pb-safe`
 * (the inset's value does not resolve under jest, so the base class string is still read too).
 * The last check stays a scan: it is a rule over every sheet
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
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
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

function openSheet(className: string): { r: ReactTestRenderer; content: ReactTestInstance } {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(GluestackUIProvider, null,
      createElement(Actionsheet, { isOpen: true, onClose: () => undefined },
        createElement(ActionsheetContent, { className }, createElement(Text, null, 'probe')))));
  });
  return { r, content: r.root.findAll((n) => n.type === ActionsheetContent)[0]! };
}

// Rendered: an open sheet's content carries the base's `pb-safe`, even with a caller's layout
// classes (as RateSheet passes). The VALUE stays a native fact: under jest UniWind leaves
// `pb-safe` without a number even after `Uniwind.updateInsets` (gate 37744935171), so the
// inset itself is only seen on the phone (Tier B).
it('an open sheet carries the base class `pb-safe`', () => {
  const { r, content } = openSheet('px-screen-x pt-gap items-stretch');
  const classed = content.findAll((n) => typeof n.props['className'] === 'string' && /(?:^|\s)pb-safe(?:\s|$)/.test(n.props['className'] as string));
  expect(classed.length).toBeGreaterThan(0);
  act(() => r.unmount());
});

// KEPT as a source check (restored): the base class string itself, since the padding value
// cannot be rendered under jest (above).
it('the sheet base still pads by the inset', () => {
  const lib = readFileSync(join(ROOT, 'src/ui/lib/actionsheet/index.tsx'), 'utf8');
  expect(lib).toMatch(/actionsheetContentStyle = tva\(\{\s*base: '[^']*\bpb-safe\b/);
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
