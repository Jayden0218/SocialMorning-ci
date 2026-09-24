/**
 * quickstart A8 + guard G5: the shared components render, carry names, roles and states,
 * and have no fixed height on anything that holds text (so the largest font still fits).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour, hit } from '../src/design';
import { BOTTOM_INSET, MINI_PLAYER_HEIGHT, Screen, TAB_BAR_HEIGHT } from '../src/ui/Screen';
import { Artwork } from '../src/ui/Artwork';
import { Row } from '../src/ui/Row';
import { Button } from '../src/ui/Button';
import { Chip } from '../src/ui/Chip';
import { Header } from '../src/ui/Header';

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

it('Button: three kinds, one look each; disabled is a state, not just an opacity', () => {
  for (const kind of ['primary', 'secondary', 'destructive'] as const) {
    const r = render(createElement(Button, { label: 'Go', onPress: () => undefined, kind }));
    const b = r.root.find((n) => n.props['accessibilityRole'] === 'button');
    expect(b.props['accessibilityLabel']).toBe('Go');
    expect(Number(flat(b.props['style'])['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  }
  const off = render(createElement(Button, { label: 'Go', onPress: () => undefined, disabled: true }));
  expect(off.root.find((n) => n.props['accessibilityRole'] === 'button').props['accessibilityState']).toEqual({ disabled: true });
});

it('Chip carries its selected state', () => {
  const on = render(createElement(Chip, { label: '1.5×', selected: true, onPress: () => undefined }));
  expect(on.root.find((n) => n.props['accessibilityRole'] === 'button').props['accessibilityState']).toEqual({ selected: true });
  const off = render(createElement(Chip, { label: '1.5×', onPress: () => undefined }));
  expect(off.root.find((n) => n.props['accessibilityRole'] === 'button').props['accessibilityState']).toEqual({ selected: false });
});

it('Header falls back to a solid bar when blur is unavailable, and its title is a header', () => {
  const solid = render(createElement(Header, { title: 'Library', blur: null }));
  const bar = solid.root.findAll((n) => typeof n.type === 'string')[0]!;
  expect(flat(bar.props['style'])['backgroundColor']).toBe(colour.background);
  expect(solid.root.find((n) => n.props['accessibilityRole'] === 'header').props['children']).toBe('Library');
  const FakeBlur = (p: { children?: React.ReactNode }) => createElement('BlurStub', null, p.children);
  const blurred = render(createElement(Header, { title: 'Library', blur: FakeBlur as never }));
  expect(json(blurred)).toContain('BlurStub');
});
