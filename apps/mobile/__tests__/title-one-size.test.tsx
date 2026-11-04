// There is one title size: 30. TitleBar and PushedPage have no `size` (038 US2, FR-004, M4).
/**
 * 038 M4: History (26) and Favourites (28), the voice page, Tips, Devices and others passed a `size` to a smaller title.
 * The design system has one page title (30, a long one shrinks to fit). The break that turns it red: give `TitleBar` its `size` prop back
 * (or pass `size={26}` to a page).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { TitleBar } from '@/ui/kit/TitleBar';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/history' }));

const ROOT = join(__dirname, '..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });

it('a title bar draws at 30 even when a caller still passes a size', () => {
  setReducedMotionForTest(true);
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } },
    createElement(TitleBar, { title: 'Listening history', top: 53, size: 26 } as React.ComponentProps<typeof TitleBar>))); });
  const t = r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
  const s = StyleSheet.flatten(t.props['style']) as Record<string, unknown>;
  const val = (v: unknown): unknown => (v && typeof v === 'object' && '__getValue' in v ? (v as { __getValue(): unknown }).__getValue() : v);
  expect(val(s['fontSize'])).toBe(30);
  act(() => r.unmount());
  setReducedMotionForTest(undefined);
});

it('no page and no kit part declares or passes a title `size`', () => {
  const bad: string[] = [];
  for (const f of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))]) {
    const src = readFileSync(f, 'utf8');
    if (!/<(TitleBar|PushedPage)\b/.test(src) && !/(TitleBar|PushedPage)\.tsx$/.test(f)) continue;
    // `size?: number` as a prop of the two parts; `size={…}` on its own line or on the page's tag line.
    if (/(TitleBar|PushedPage)\.tsx$/.test(f) && /^\s+size\?: number;/m.test(src)) bad.push(`${f}: declares size`);
    for (const m of src.matchAll(/<(?:TitleBar|PushedPage)\b(?:[^>\n]|=>)*?\ssize=/g)) bad.push(`${f}: ${m[0].slice(0, 60)}`);
    if (/<(TitleBar|PushedPage)\b/.test(src)) for (const m of src.matchAll(/\n\s+size=\{[^}]+\}\s*\n/g)) bad.push(`${f}: ${m[0].trim()}`);
  }
  expect(bad.map((b) => b.replace(ROOT, ''))).toEqual([]);
});
