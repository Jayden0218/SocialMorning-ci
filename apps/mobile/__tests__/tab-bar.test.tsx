/**
 * The bottom tab bar (M7 T012). Written by hand, so it is tested by hand.
 *
 * The role and the state are the whole point: M6's J5 found twice that a navigation
 * node without a real role is read by TalkBack as plain text, and a listener driving
 * the app by name alone then cannot move between tabs at all.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour, hit } from '../src/design';
import { TabBar } from '../src/ui/TabBar';
import { TAB_BAR_HEIGHT } from '../src/ui/Screen';

const ITEMS = [
  { key: 'index', label: 'Library' },
  { key: 'discover', label: 'Discover' },
  { key: 'following', label: 'Following' },
] as const;

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  return r;
};
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
// `findAll` walks composites AND host nodes, so a Pressable matches twice. Keep the
// host node: it is what Android actually exposes to a screen reader.
const hosts = (r: ReactTestRenderer, role: string) =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === role);
const tabs = (r: ReactTestRenderer) => hosts(r, 'tab');

it('every tab is a real tab: a role, a name, and a selected state', () => {
  const r = render(createElement(TabBar, { items: ITEMS, activeKey: 'discover', onSelect: jest.fn() }));
  const found = tabs(r);
  expect(found.map((t) => t.props['accessibilityLabel'])).toEqual(['Library', 'Discover', 'Following']);
  expect(found.map((t) => t.props['accessibilityState'].selected)).toEqual([false, true, false]);
  const list = hosts(r, 'tablist');
  expect(list).toHaveLength(1);
});

it('selecting a tab reports its key; re-selecting the active one is the layout\'s call, not the bar\'s', () => {
  const onSelect = jest.fn();
  const r = render(createElement(TabBar, { items: ITEMS, activeKey: 'index', onSelect }));
  act(() => tabs(r)[2]!.props['onPress']());
  expect(onSelect).toHaveBeenCalledWith('following');
});

it('a badge is in the NAME as well as on screen — a count no screen reader can hear is not a count', () => {
  const items = [ITEMS[0], ITEMS[1], { key: 'following', label: 'Following', badge: 3 }];
  const r = render(createElement(TabBar, { items, activeKey: 'index', onSelect: jest.fn() }));
  const following = tabs(r)[2]!;
  expect(following.props['accessibilityLabel']).toBe('Following, 3 new');
  expect(JSON.stringify(r.toJSON())).toContain('Following (3)');
});

it('no fixed height anywhere, and every tab clears the 48 dp target', () => {
  const r = render(createElement(TabBar, { items: ITEMS, activeKey: 'index', onSelect: jest.fn() }));
  const bar = flat(r.root.findAll((n) => typeof n.type === 'string')[0]!.props['style']);
  expect(bar['height']).toBeUndefined();
  expect(bar['minHeight']).toBe(TAB_BAR_HEIGHT);
  expect(bar['backgroundColor']).toBe(colour.surface);
  for (const t of tabs(r)) {
    const s = flat(t.props['style']);
    expect(s['height']).toBeUndefined();
    expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  }
});

it('the active tab differs by weight as well as colour (FR-016: never hue alone)', () => {
  const r = render(createElement(TabBar, { items: ITEMS, activeKey: 'index', onSelect: jest.fn() }));
  const labels = r.root.findAll((n) => String(n.type) === 'Text').map((n) => flat(n.props['style']));
  expect(labels[0]!['fontWeight']).toBe('700');
  expect(labels[1]!['fontWeight']).toBeUndefined();
});
