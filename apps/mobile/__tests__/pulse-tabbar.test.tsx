// Tests the Pulse tab bar: icons only, one hot dot, badges (count, 99+, dot), the name bubble, the rail.
/**
 * M31 T022 (design-pulse2 index.html §Bars, discover.html `tabs--bar`). Every state of the tab bar:
 * idle / active icons, the active dot, a count badge (16 tall, `99+` over 99), a 7 dot with no
 * count, the long-press name bubble for 1.2 s, the selection tick, and the wide-window rail.
 * The break that turns it red: draw a label under each icon (the drawings have none), or draw the
 * dot on every tab.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { TabBar, type TabItem } from '@/ui/shell/TabBar';
import { bars, colour } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockTick = jest.fn();
jest.mock('@/ui/kit/haptics', () => ({ tick: () => mockTick() }));

const ITEMS: TabItem[] = [
  { key: 'index', label: 'Discover', icon: { idle: 'compass-outline', active: 'compass' } },
  { key: 'library', label: 'Updates', icon: { idle: 'headset-outline', active: 'headset' } },
  { key: 'chat', label: 'Chat', icon: { idle: 'chatbubbles-outline', active: 'chatbubbles' } },
  { key: 'me', label: 'Me', icon: { idle: 'person-circle-outline', active: 'person-circle' } },
];

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); mockTick.mockClear(); });
beforeEach(() => setReducedMotionForTest(true));

function render(props: Partial<React.ComponentProps<typeof TabBar>> = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(TabBar, { items: ITEMS, activeKey: 'index', onSelect: jest.fn(), ...props })); });
  mounted.push(r);
  return r;
}
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean) => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const tabs = (r: ReactTestRenderer) => hosts(r, (n) => n.props['accessibilityRole'] === 'tab');
const byId = (r: ReactTestRenderer, id: string) => hosts(r, (n) => n.props['testID'] === id);
/** The bar reports its width once it is laid out; the dot needs it. */
const layout = (r: ReactTestRenderer, width = 400) => act(() => {
  r.root.findAll((n) => n.props['accessibilityRole'] === 'tablist' && typeof n.props['onLayout'] === 'function')[0]!.props['onLayout']({ nativeEvent: { layout: { width, height: 58 } } });
});
/** The words drawn under a node (host Text children). */
const words = (n: ReactTestInstance | ReactTestRenderer): string[] => ('root' in n ? n.root : n).findAll((x) => String(x.type) === 'Text').map((x) => [x.props['children']].flat(5).join(''));
const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const pressOf = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;

it('icons only: four tabs, each an icon of 26, no label drawn — the names are for the screen reader', () => {
  const r = render();
  expect(tabs(r).map((t) => t.props['accessibilityLabel'])).toEqual(['Discover', 'Updates', 'Chat', 'Me']);
  const icons = r.root.findAll((n) => typeof n.props['name'] === 'string' && n.props['size'] === bars.tabIcon);
  expect(new Set(icons.map((i) => i.props['name']))).toEqual(new Set(['compass', 'headset-outline', 'chatbubbles-outline', 'person-circle-outline']));
  expect(words(r)).toEqual([]); // no Text anywhere: nothing is written under the icons
});

it('idle icons are `idle` coloured outlines; the active one is the filled icon in `text` colour', () => {
  const r = render({ activeKey: 'library' });
  const color = (name: string) => r.root.findAll((n) => n.props['name'] === name && n.props['size'] === bars.tabIcon)[0]!.props['color'];
  expect(color('headset')).toBe(colour.text);
  expect(color('compass-outline')).toBe(colour.idle);
});

it('one hot dot, only under the active tab, 5 pt; it slides to the new tab (here: at once, Reduce Motion)', () => {
  const r = render({ activeKey: 'library' });
  expect(byId(r, 'tab-active-dot')).toHaveLength(0); // not laid out yet
  layout(r, 400);
  const dots = byId(r, 'tab-active-dot');
  expect(dots).toHaveLength(1);
  const style = (dots[0]!.props['style'] as object[]).flat(3) as { width?: number; height?: number }[];
  expect(style.find((s) => s.width !== undefined)).toMatchObject({ width: bars.dot, height: bars.dot });
  act(() => { r.update(createElement(TabBar, { items: ITEMS, activeKey: 'me', onSelect: jest.fn() })); });
  expect(byId(r, 'tab-active-dot')).toHaveLength(1);
});

it('a count badge is 16 tall with the count in it; over 99 it says 99+; the spoken name carries the count', () => {
  const items = ITEMS.map((i) => (i.key === 'chat' ? { ...i, badge: 3 } : i.key === 'me' ? { ...i, badge: 150 } : i));
  const r = render({ items });
  const badges = byId(r, 'tab-badge');
  expect(badges).toHaveLength(2);
  expect(words(r)).toEqual(['3', '99+']);
  const pill = badges[0]!.findAll((n) => typeof n.type === 'string' && flat(n.props['style'])['height'] === bars.badge && flat(n.props['style'])['minWidth'] === bars.badge);
  expect(pill.length).toBeGreaterThan(0); // 16 tall, at least 16 wide
  expect(tabs(r).map((t) => t.props['accessibilityLabel'])).toEqual(['Discover', 'Updates', 'Chat, 3 new', 'Me, 150 new']);
});

it('a dot badge (7, no count) means "new"; it is in the spoken name too', () => {
  const items = ITEMS.map((i) => (i.key === 'me' ? { ...i, dot: true } : i));
  const r = render({ items });
  expect(byId(r, 'tab-dot-badge')).toHaveLength(1);
  expect(byId(r, 'tab-badge')).toHaveLength(0);
  expect(tabs(r)[3]!.props['accessibilityLabel']).toBe('Me, new');
  const zero = render({ items: ITEMS.map((i) => (i.key === 'chat' ? { ...i, badge: 0 } : i)) });
  expect(tabs(zero)[2]!.props['accessibilityLabel']).toBe('Chat'); // a zero badge is no badge
});

it('touching another tab gives the light tick and a tap reports its key; the active tab asks for no tick', () => {
  const onSelect = jest.fn();
  const r = render({ onSelect, activeKey: 'index' });
  act(() => { pressOf(r, 'Chat').props['onPressIn'](); pressOf(r, 'Chat').props['onPress'](); });
  expect(onSelect).toHaveBeenCalledWith('chat');
  expect(mockTick).toHaveBeenCalledTimes(1);
  act(() => { pressOf(r, 'Discover').props['onPressIn'](); pressOf(r, 'Discover').props['onPress'](); });
  expect(onSelect).toHaveBeenLastCalledWith('index');
  expect(mockTick).toHaveBeenCalledTimes(1);
});

it('long-press shows the name in a bubble for 1.2 s, then it goes', () => {
  const r = render();
  expect(byId(r, 'tab-name-bubble')).toHaveLength(0);
  act(() => { pressOf(r, 'Updates').props['onLongPress'](); });
  const bubble = byId(r, 'tab-name-bubble');
  expect(bubble).toHaveLength(1);
  expect(words(bubble[0]!)).toEqual(['Updates']);
  act(() => { jest.advanceTimersByTime(1100); });
  expect(byId(r, 'tab-name-bubble')).toHaveLength(1);
  act(() => { jest.advanceTimersByTime(200); });
  expect(byId(r, 'tab-name-bubble')).toHaveLength(0);
});

it('the bar is the void colour with a hairline on top and never a fixed height', () => {
  const r = render();
  const bar = hosts(r, (n) => n.props['accessibilityRole'] === 'tablist')[0]!;
  const style = ([] as { minHeight?: number; height?: number; backgroundColor?: string }[]).concat(bar.props['style']).flat(3).filter(Boolean);
  expect(style.some((s) => s.minHeight === bars.tab)).toBe(true);
  expect(style.every((s) => s.height === undefined)).toBe(true);
  expect(JSON.stringify(bar.props['className'] ?? '')).toBeDefined();
});

it('rail (wide window): the same tabs as a column, each icon over its name, the active one with its dot', () => {
  const items = ITEMS.map((i) => (i.key === 'chat' ? { ...i, badge: 2 } : i));
  const r = render({ mode: 'rail', items, activeKey: 'library' });
  expect(hosts(r, (n) => n.props['accessibilityRole'] === 'tablist')).toHaveLength(1);
  expect(tabs(r).map((t) => t.props['accessibilityLabel'])).toEqual(['Discover', 'Updates', 'Chat, 2 new', 'Me']);
  expect(tabs(r).map((t) => t.props['accessibilityState'].selected)).toEqual([false, true, false, false]);
  expect(byId(r, 'tab-active-dot')).toHaveLength(1);
  expect(byId(r, 'tab-badge')).toHaveLength(1);
  expect(words(r)).toContain('Updates');
});
