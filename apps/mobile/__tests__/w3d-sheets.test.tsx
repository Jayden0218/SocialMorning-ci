// Checks the Like sheet and the More sheet sit on the kit sheet, with the drawn buttons and Panel rows.
/**
 * M31 W3-D (design-pulse2 episode--like-sheet, lists--more-sheet). Reds: put the Gluestack Actionsheet
 * back (no "action-sheet" testID), swap Skip/Save, drop the heart disc (52), or stop closing before a row runs.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { LikeSheet } from '@/ui/social/LikeSheet';
import { MoreSheet } from '@/ui/social/MoreSheet';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('@/ui/kit/useColours', () => ({ useColours: () => require('@/design').colour }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: {} }) }));
jest.mock('@/social/profile-api', () => ({ LIKE_NOTE_MAX: 140 }));

const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
let r: ReactTestRenderer;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => r?.unmount()); setReducedMotionForTest(undefined); });
const pressable = (label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;

it('Like sheet: kit sheet, 52 heart disc, Skip then Save, Save needs a note', () => {
  const onSave = jest.fn(); const onSkip = jest.fn();
  act(() => { r = create(createElement(LikeSheet, { open: true, title: 'Why mornings matter', onSave, onSkip })); });
  expect(r.root.findAll((n) => n.props['testID'] === 'action-sheet').length).toBeGreaterThan(0);
  const disc = r.root.findAll((n) => { const f = flat(n.props['style']); return f['width'] === 52 && f['height'] === 52; });
  expect(disc.length).toBeGreaterThan(0);
  const order = r.root.findAll((n) => typeof n.type === 'string' && ['Skip', 'Save'].includes(n.props['accessibilityLabel'])).map((n) => n.props['accessibilityLabel']).filter((l, i, a) => a.indexOf(l) === i);
  expect(order).toEqual(['Skip', 'Save']);
  expect(r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Save')[0]!.props['accessibilityState']).toMatchObject({ disabled: true });
  act(() => { pressable('Skip').props['onPress'](); });
  expect(onSkip).toHaveBeenCalled();
});
it('More sheet: Panel rows 56 tall, a row closes then runs, Cancel closes', () => {
  const onClose = jest.fn(); const run = jest.fn();
  act(() => { r = create(createElement(MoreSheet, { open: true, title: 'More', rows: [{ icon: 'flag-outline', label: 'Report this list', onPress: run }], onClose })); });
  expect(flat(pressable('Report this list').props['style'])['minHeight']).toBe(56);
  act(() => { pressable('Report this list').props['onPress'](); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledTimes(1);
  act(() => { pressable('Cancel').props['onPress'](); });
  expect(onClose).toHaveBeenCalledTimes(2);
});
