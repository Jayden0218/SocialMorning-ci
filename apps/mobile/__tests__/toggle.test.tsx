// Tests that the app's own switch speaks its state and has a big target.
/**
 * M16a guard G-N2 (FR-014): the app-drawn Toggle that replaced the iOS switch is still a switch
 * to a screen reader — role "switch", its name, and `accessibilityState.checked` that follows
 * the value — and a 48 pt target. A drawn control that loses its state is a silent regression:
 * VoiceOver would say "switch" with no "on" or "off".
 *
 * The break that turns it red: drop `accessibilityState` from the Pressable in src/ui/kit/Toggle.tsx.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Toggle } from '@/ui/kit/Toggle';

const render = (value: boolean, onChange = jest.fn(), disabled?: boolean): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Toggle, { value, onChange, label: 'Hide explicit episodes', ...(disabled !== undefined ? { disabled } : {}) })); });
  return r;
};
const theSwitch = (r: ReactTestRenderer): ReactTestInstance =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'switch')[0]!;
/** The outermost element that takes the press (the lib Pressable the Toggle renders). */
const press = (r: ReactTestRenderer): void =>
  r.root.findAll((n) => n.props['accessibilityRole'] === 'switch' && typeof n.props['onPress'] === 'function')[0]!.props['onPress']();

it('announces role switch, its label and its checked state, on and off', () => {
  const on = theSwitch(render(true));
  expect(on.props['accessibilityLabel']).toBe('Hide explicit episodes');
  expect(on.props['accessibilityState']).toMatchObject({ checked: true });
  expect(theSwitch(render(false)).props['accessibilityState']).toMatchObject({ checked: false });
});

it('a tap asks for the other value', () => {
  const onChange = jest.fn();
  const r = render(false, onChange);
  act(() => { press(r); });
  expect(onChange).toHaveBeenCalledWith(true);
});

it('disabled: says so, and a tap changes nothing', () => {
  const onChange = jest.fn();
  const r = render(true, onChange, true);
  expect(theSwitch(r).props['accessibilityState']).toMatchObject({ checked: true, disabled: true });
  act(() => { press(r); });
  expect(onChange).not.toHaveBeenCalled();
});

it('the target is at least 48 pt', () => {
  const s = (StyleSheet.flatten(theSwitch(render(true)).props['style']) ?? {}) as Record<string, unknown>;
  expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(48);
  expect(Number(s['minWidth'])).toBeGreaterThanOrEqual(48);
});
