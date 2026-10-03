/**
 * M16a guard G-T1 (FR-010, gluestack audit P0): VoiceOver speaks every toast. The toast box had
 * only `accessibilityLiveRegion="polite"`, which is Android-only, so on the iPhone no toast was
 * ever read out. The host now calls `AccessibilityInfo.announceForAccessibility` on iOS (as
 * gluestack's own ToastTitle does) and keeps the live region for TalkBack.
 *
 * The break that turns it red: remove the announce call (`announceToast(message)`) from the
 * effect in src/ui/ToastHost.tsx.
 */
import { createElement } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ToastHost } from '../src/ui/ToastHost';

let spoken: jest.SpyInstance;
beforeEach(() => { spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined); });
afterEach(() => spoken.mockRestore());

it('runs as iOS — where the live region alone said nothing', () => {
  expect(Platform.OS).toBe('ios');
});

it('a toast is announced, and a new one is announced again', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ToastHost, { message: 'Added to queue' })); });
  expect(spoken).toHaveBeenCalledWith('Added to queue');
  act(() => { r.update(createElement(ToastHost, { message: 'Downloads cleared.' })); });
  expect(spoken).toHaveBeenLastCalledWith('Downloads cleared.');
  expect(JSON.stringify(r.toJSON())).toContain('Downloads cleared.');
});

it('no toast, nothing said and nothing drawn', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ToastHost, { message: undefined })); });
  expect(spoken).not.toHaveBeenCalled();
  expect(r.toJSON()).toBeNull();
});

it('the Android live region stays on the box', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ToastHost, { message: 'Added to queue' })); });
  expect(r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLiveRegion'] === 'polite').length).toBeGreaterThan(0);
});
