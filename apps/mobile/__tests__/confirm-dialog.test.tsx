// Checks the app's "Are you sure?" is the Pulse dialog: Cancel quiet, the action light or hot, a notice a lone OK.
/**
 * M31 W3-D (design-pulse2 dialog drawings; M17 guard on button names kept). Reds: put the sheet back
 * (no testID "dialog"), swap the order of the buttons, or make isDestructive always false.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { ConfirmDialog, isDestructive } from '@/ui/kit/confirm';

jest.mock('@/ui/kit/useReducedMotion', () => ({ useReducedMotion: () => true }));

const labels = (t: ReturnType<typeof create>) => t.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel !== 'Close' && typeof n.props.onPress === 'function').map((n) => n.props.accessibilityLabel as string).filter((l, i, a) => a.indexOf(l) === i);

it('draws the kit dialog with Cancel then the action, and the action runs after closing', () => {
  const onClose = jest.fn(); const onConfirm = jest.fn();
  let t!: ReturnType<typeof create>;
  act(() => { t = create(createElement(ConfirmDialog, { request: { title: 'Delete 1 episode?', message: 'The files leave this phone.', action: 'Delete', onConfirm }, onClose })); });
  expect(t.root.findByProps({ testID: 'dialog' })).toBeTruthy();
  expect(labels(t)).toEqual(['Cancel', 'Delete']);
  const kindOf = (l: string) => t.root.findAll((n) => n.props.label === l && typeof n.props.kind === 'string')[0]?.props.kind;
  expect(kindOf('Cancel')).toBe('quiet');
  expect(kindOf('Delete')).toBe('hot');
  const del = t.root.findAll((n) => n.props.accessibilityLabel === 'Delete' && typeof n.props.onPress === 'function')[0]!;
  act(() => { del.props.onPress(); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
it('a notice (cancel: null) is one OK button', () => {
  let t!: ReturnType<typeof create>;
  act(() => { t = create(createElement(ConfirmDialog, { request: { title: "You can't block yourself.", cancel: null }, onClose: jest.fn() })); });
  expect(labels(t)).toEqual(['OK']);
});
it('closed with no request draws nothing', () => {
  let t!: ReturnType<typeof create>;
  act(() => { t = create(createElement(ConfirmDialog, { request: undefined, onClose: jest.fn() })); });
  expect(t.toJSON()).toBeNull();
});
it('words that destroy are hot, others light; `danger` overrides', () => {
  for (const a of ['Delete', 'Clear all', 'Block', 'Remove', 'Sign out']) expect(isDestructive({ action: a })).toBe(true);
  for (const a of ['OK', 'Keep', 'Continue', undefined]) expect(isDestructive({ action: a })).toBe(false);
  expect(isDestructive({ action: 'Continue', danger: true })).toBe(true);
  expect(isDestructive({ action: 'Delete', danger: false })).toBe(false);
});
