// Spec 039 US3 (T019): the tab bar draws a word under each icon, and every tab is at least 44 x 44.
/**
 * Written BEFORE the change: red while the bar is icons only. Asks: the four real tab names (Discover, Updates, Chat, Me) are DRAWN as text,
 * the active one in the `text` colour and the others in `idle`; every tab is at least 44 tall and takes an equal share of the width; and the
 * bar is taller than the old 58 by exactly one label line (`bars.tab`), which `bottomInset` and `nowBarBottom` follow.
 * The break that turns it red: remove the label Text, or let `bars.tab` stay 58.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { TabBar } from '@/ui/shell/TabBar';
import { TABS } from '@/ui/shell/tabs';
import { bars, bottomInset, nowBarBottom, typeScale } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('@/ui/kit/haptics', () => ({ tick: jest.fn() }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
beforeEach(() => setReducedMotionForTest(true));
function render(activeKey = 'index'): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(TabBar, { items: TABS, activeKey, onSelect: jest.fn() })); });
  mounted.push(r);
  return r;
}
const tabs = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab');
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const labelOf = (r: ReactTestRenderer, name: string): ReactTestInstance => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === `tab-label-${name}`)[0]!;
const textOf = (n: ReactTestInstance): string => [n.props['children']].flat(5).join('');

it('draws the four names as text under the icons', () => {
  const r = render();
  expect(tabs(r)).toHaveLength(4);
  expect(['Discover', 'Updates', 'Chat', 'Me'].map((n) => textOf(labelOf(r, n)))).toEqual(['Discover', 'Updates', 'Chat', 'Me']);
});

it('the active label is `text`, the others `idle`: colour AND the filled icon say which tab, not colour alone', () => {
  const r = render('chat');
  const cls = (n: string) => String(labelOf(r, n).props['className']).split(' ');
  expect(cls('Chat')).toContain('text-text');
  for (const n of ['Discover', 'Updates', 'Me']) expect(cls(n)).toContain('text-idle');
});

it('every tab is at least 44 tall and the four share the width equally', () => {
  const r = render();
  for (const t of tabs(r)) {
    expect(Number(flat(t)['minHeight'])).toBeGreaterThanOrEqual(44);
    expect(t.props['className']).toContain('flex-1');
  }
});

it('the bar grew by one label line, and the insets follow it', () => {
  expect(bars.tab).toBe(58 + typeScale.tag.lineSafe);
  expect(bottomInset(34, { tabs: true })).toBe(34 + bars.tab);
  expect(nowBarBottom(34, { tabs: true })).toBe(34 + bars.tab + bars.nowGap);
  const bar = flat(render().root.findAll((n) => typeof n.type === 'string')[0]!);
  expect(bar['minHeight']).toBe(bars.tab);
});

it('the labels are in the UI family (Geist), not the mono family the `tag` step uses (device run 42017007191)', () => {
  const r = render();
  for (const n of ['Discover', 'Updates', 'Chat', 'Me']) {
    const l = labelOf(r, n);
    expect(String(l.props['className'])).not.toContain('font-mono');
    expect(String(flat(l)['fontFamily'] ?? '')).not.toMatch(/mono/i);
  }
});
