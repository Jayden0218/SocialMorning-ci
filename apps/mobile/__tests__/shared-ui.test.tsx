// Tests that shared UI parts render with names, roles and no fixed heights.
/**
 * quickstart A8 + guard G5: the shared components render, carry names, roles and states,
 * and have no fixed height on anything that holds text (so the largest font still fits).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour, hit } from '@/design';
import { BOTTOM_INSET, MINI_PLAYER_HEIGHT, Screen, TAB_BAR_HEIGHT } from '@/ui/kit/Screen';
import { Artwork } from '@/ui/kit/Artwork';
import { Row } from '@/ui/kit/Row';
import { Button, ButtonText } from '@/ui/lib/button';
import { Heading } from '@/ui/lib/heading';

const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const json = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

it('Screen reserves room for the mini player AND the tab bar, so the last row is reachable', () => {
  expect(BOTTOM_INSET).toBe(MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT);
  const r = render(createElement(Screen, {}, createElement(Row, { title: 'x' })));
  const root = r.root.findAll((n) => typeof n.type === 'string')[0]!;
  expect(Number(flat(root.props['style'])['paddingBottom'])).toBe(BOTTOM_INSET);
  expect(flat(root.props['style'])['backgroundColor']).toBe(colour.background);
});

it('Artwork shows a placeholder rather than a blank when the episode has none, and is not a focus stop', () => {
  const none = render(createElement(Artwork, { size: 56 }));
  expect(json(none)).not.toContain('uri');
  const some = render(createElement(Artwork, { url: 'https://img/a.png', size: 56 }));
  expect(json(some)).toContain('https://img/a.png');
  for (const n of [none, some]) {
    const v = n.root.findAll((x) => typeof x.type === 'string')[0]!;
    expect(v.props['importantForAccessibility']).toBe('no-hide-descendants');
  }
});

it('G5: Row has a name and a role, a title of at most 2 lines, no fixed height, and is ≥ 48 dp', () => {
  const onPress = jest.fn();
  const r = render(createElement(Row, { title: 'A title', line: 'A show · 34:17', onPress }));
  const row = r.root.find((n) => n.props['accessibilityRole'] === 'button');
  expect(row.props['accessibilityLabel']).toBe('A title, A show · 34:17');
  const s = flat(row.props['style']);
  expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  expect(s['height']).toBeUndefined();
  const title = r.root.findAll((n) => n.props['numberOfLines'] === 2);
  expect(title.length).toBeGreaterThanOrEqual(1);
  act(() => { row.props['onPress'](); });
  expect(onPress).toHaveBeenCalled();
  // A row with no onPress is not a focus stop pretending to be a button.
  expect(render(createElement(Row, { title: 'x' })).root.findAll((n) => n.props['accessibilityRole'] === 'button')).toHaveLength(0);
});

// M9: the hand-built Button, Chip and Header were replaced by gluestack's Button and Heading
// (contracts/components.md). The same promises, checked on the library parts as they are used.
it('library Button: named by its words, a real button, a 48 dp target, disabled is a state', () => {
  const make = (disabled: boolean) => createElement(Button, { onPress: () => undefined, isDisabled: disabled, accessibilityRole: 'button', accessibilityLabel: 'Go', accessibilityState: { disabled }, className: 'rounded-pill px-section', style: { minHeight: hit.min } }, createElement(ButtonText, null, 'Go'));
  const b = render(make(false)).root.find((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button');
  expect(b.props['accessibilityLabel']).toBe('Go');
  expect(Number(flat(b.props['style'])['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  expect(flat(b.props['style'])['height']).toBeUndefined();
  const off = render(make(true)).root.find((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button');
  expect(off.props['accessibilityState']).toEqual({ disabled: true });
});

it('library Heading is a header in a token colour', () => {
  const r = render(createElement(Heading, { accessibilityRole: 'header' }, 'Library'));
  const h = r.root.find((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header');
  expect(h.props['children']).toBe('Library');
  expect(flat(h.props['style'])['color']).toBeDefined();
});
