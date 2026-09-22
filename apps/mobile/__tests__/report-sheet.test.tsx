/** M6 US1: the report sheet collects one reason + a note and hands them to the safety layer; own content is refused in place. */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const report = jest.fn<'hidden' | 'sign_in' | 'own', unknown[]>(() => 'hidden');
const push = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a) } }));
jest.mock('../src/safety/context', () => ({ useSafety: () => ({ safety: { report } }), announce: jest.fn() }));

import { ReportSheet } from '../src/ui/ReportSheet';
import { PLACEHOLDER_TEXT, placeholderFor } from '../src/ui/Placeholder';

const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');

it('picks a reason, sends with the note, closes; Send is disabled until a reason is chosen', () => {
  const onClose = jest.fn();
  const onReported = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ReportSheet, { target: { kind: 'comment', id: 'c1', authorId: 'them', label: 'comment' }, onClose, onReported })); });
  expect(byLabel(r, 'Send report').props['accessibilityState']).toEqual({ disabled: true });
  act(() => { byLabel(r, 'Harassment').props['onPress'](); });
  expect(byLabel(r, 'Harassment').props['accessibilityState']).toEqual({ checked: true });
  act(() => { r.root.find((n) => n.props['accessibilityLabel'] === 'Note, optional').props['onChangeText']('  see it  '); });
  act(() => { byLabel(r, 'Send report').props['onPress'](); });
  expect(report).toHaveBeenCalledWith('comment', 'c1', 'them', 'harassment', 'see it');
  expect(onClose).toHaveBeenCalled();
  expect(onReported).toHaveBeenCalled();
});

it('own content: the sheet stays with the hint; signed out: closes and goes to sign-in', () => {
  report.mockReturnValueOnce('own');
  const onClose = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ReportSheet, { target: { kind: 'clip', id: 'k1', authorId: 'me', label: 'clip' }, onClose })); });
  act(() => { byLabel(r, 'Spam').props['onPress'](); });
  act(() => { byLabel(r, 'Send report').props['onPress'](); });
  expect(JSON.stringify(r.toJSON())).toContain("That's yours — delete it instead.");
  expect(onClose).not.toHaveBeenCalled();
  report.mockReturnValueOnce('sign_in');
  act(() => { byLabel(r, 'Send report').props['onPress'](); });
  expect(onClose).toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith('/auth/sign-in');
});

it('placeholderFor picks the one word a row becomes', () => {
  expect(placeholderFor({ deleted: false })).toBeUndefined();
  expect(placeholderFor({ deleted: true })).toBe('deleted');
  expect(placeholderFor({ deleted: true, removed: true })).toBe('removed');
  expect(placeholderFor({ deleted: true, removed: true, mine: true })).toBe('removed_mine');
  expect(placeholderFor({ deleted: true, blocked: true })).toBe('blocked');
  expect(placeholderFor({ deleted: false }, true)).toBe('reported');
  expect(PLACEHOLDER_TEXT.blocked).toBe("A blocked listener's reply");
});
