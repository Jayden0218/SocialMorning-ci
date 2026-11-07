// Tests the 036 second-reading defects (E1, E2, E4, E5, E6, E7) found in the -xl screenshots: nothing overlaps or is cut at the largest text.
/**
 * 036 L2b (gate-log.md "T012 second reading"). No layout engine here, so each guard is style-level or a source-text pin:
 *   E1  r07-04: the speed dial's readout is drawn inside a fixed 176 ring; it must not grow with the system text (the knob sat on its "1").
 *   E2  r07-07: the sleep countdown hangs on the 44 moon; it is drawn-size text, not scaled onto the glyph.
 *   E4  r08-02: the comment box's text is capped like every Type (the raw TextInput grew without limit and its first line was cut).
 *   E5  r13-06: "My subscriptions" at large text takes two lines at most, so shrink-to-fit can act (at three it broke mid-word).
 *   E6  r13-12: a chip wider than the 46 column pushes the label along (it touched "On Episode 1...").
 *   E7  r04-09: a one-column category tile keeps its name inside the 84 row (drawn size, two lines).
 * E3 and E8 were not confirmed as defects (see the report); E9, E10 skipped.
 * Breaks that turn each red: remove the cap / prop that the test names; restore `numberOfLines` 3 in TitleBar.
 */
import { createElement } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: mockScale })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true }, useRouter: () => ({ push: jest.fn() }), usePathname: () => '/x' }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => jest.fn() }));
jest.mock('@/config/store', () => ({ useAppConfig: () => ({}) }));

import { TitleBar } from '@/ui/kit/TitleBar';
import { SpeedDial } from '@/ui/player/SpeedDial';
import { ThreadNode } from '@/ui/me/lists';

let r: ReactTestRenderer;
afterEach(() => { act(() => r?.unmount()); mockScale = 1; });
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const texts = (): ReactTestInstance[] => r.root.findAll((n) => String(n.type) === 'Text');

it('E1 the speed readout does not scale with the system text', () => {
  act(() => { r = create(createElement(SpeedDial, { rate: 1, onChange: jest.fn() })); });
  const readout = texts().find((t) => t.props['children'] === '1.0×')!;
  expect(readout).toBeDefined();
  expect(Number(readout.props['maxFontSizeMultiplier'])).toBeLessThanOrEqual(1);
});

it('E2 the sleep countdown under the moon is drawn-size text', () => {
  expect(src('src/ui/player/MoonButton.tsx')).toMatch(/<Type step="badge"[^>]*maxFontSizeMultiplier=\{FIXED_TYPE\}/);
});

it('E4 the comment box text is capped like the rest of the type', () => {
  expect(src('src/ui/comments/Composer.tsx')).toMatch(/<TextareaInput[^>]*[\s\S]{0,400}maxFontSizeMultiplier=\{TYPE_CAP\}/);
});

it('E5 a long-word title at large text takes at most two lines, so shrink-to-fit can act', () => {
  mockScale = 3.1;
  act(() => { r = create(createElement(TitleBar, { title: 'My subscriptions', top: 53, actions: [{ icon: 'search-outline', label: 'Search', onPress: jest.fn() }] })); });
  const t = texts().find((x) => x.props['accessibilityRole'] === 'header')!;
  expect(t.props['adjustsFontSizeToFit']).toBe(true);
  expect(t.props['numberOfLines']).toBeLessThanOrEqual(2);
});

it('E6 a chip wider than the column pushes the label along', () => {
  act(() => { r = create(createElement(ThreadNode, { lead: createElement('Text' as never, null, '00:02'), label: createElement('Text' as never, null, 'On Episode 1') } as unknown as React.ComponentProps<typeof ThreadNode>, createElement('Text' as never, null, 'x'))); });
  const inner = r.root.findAll((n) => n.props['testID'] === 'thread-lead-inner')[0]!;
  expect(inner).toBeDefined();
  act(() => { (inner.props['onLayout'] as (e: unknown) => void)({ nativeEvent: { layout: { width: 74, height: 22 } } }); });
  const lead = r.root.findAll((n) => n.props['testID'] === 'thread-lead')[0]!;
  expect(Number(flat(lead)['marginRight'] ?? 0)).toBeGreaterThanOrEqual(14);
});

it('E7 a one-column category tile name is drawn size and at most two lines', () => {
  const s = src('app/categories.tsx');
  expect(s).toMatch(/maxFontSizeMultiplier=\{[^}]*FIXED_TYPE/);
  expect(s).not.toMatch(/numberOfLines=\{3\}/);
});
