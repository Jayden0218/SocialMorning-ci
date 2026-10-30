// Tests the report sheet: pick a reason, add a note, send, or sign in.
/** M6 US1 (M9: now a gluestack Actionsheet, so it renders inside the provider's overlay): the report sheet collects one reason + a note and hands them to the safety layer; own content is refused in place. */
// The gluestack sheets animate with @legendapp/motion, which starts each animation from a
// requestAnimationFrame (a setTimeout under jest). With real timers those fired after the file
// had finished: "Jest environment has been torn down … reading 'timing'" (gate 37714062341).
// Fake timers keep them inside the test; nothing here depends on an animation finishing.
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// jest.mock factories are hoisted, so anything they touch must be named `mock*`.
const mockReport = jest.fn<'hidden' | 'sign_in' | 'own', unknown[]>(() => 'hidden');
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ safety: { report: (...a: unknown[]) => mockReport(...a) } }), announce: jest.fn() }));
// M10b US4: the component reads its palette through useStores(); pin it to light so the
// colour assertions compare against `colour`, whatever the runner's system scheme is.
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));
const report = mockReport;
const push = mockPush;

import { ReportSheet } from '@/ui/comments/ReportSheet';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { PLACEHOLDER_TEXT, placeholderFor } from '@/ui/comments/Placeholder';

const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');

it('picks a reason, sends with the note, closes; Send is disabled until a reason is chosen', () => {
  const onClose = jest.fn();
  const onReported = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(GluestackUIProvider, null, createElement(ReportSheet, { target: { kind: 'comment', id: 'c1', authorId: 'them', label: 'comment' }, onClose, onReported }))); });
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
  act(() => { r = create(createElement(GluestackUIProvider, null, createElement(ReportSheet, { target: { kind: 'clip', id: 'k1', authorId: 'me', label: 'clip' }, onClose }))); });
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
