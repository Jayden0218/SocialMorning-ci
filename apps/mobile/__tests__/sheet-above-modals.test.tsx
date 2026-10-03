// Tests that sheets and dialogs open above pages shown over the Search modal.
/**
 * M16a guard G-B1 (FR-001): a sheet opens above a page that sits over the Search modal.
 *
 * Phone walk 2026-10-02, bug 1: an episode opened from Search — ⋯ did nothing. gluestack portals
 * every sheet to <GluestackUIProvider>, i.e. the app's root view, and Search is a native
 * `transparentModal`, so the episode page (and its sheet's portal target) lived in different
 * layers: the sheet opened underneath the modal. The fix lifts each overlay's root into
 * react-native-screens' FullWindowOverlay on iOS (src/ui/lib/above-modals). This renders the
 * real lib Actionsheet and AlertDialog and checks that their content is inside that overlay.
 * Whether iOS then draws it on top is the phone's row (Tier B), not this test's.
 *
 * The break that turns it red: put `Root: View` back in src/ui/lib/actionsheet/index.tsx (or
 * `withStyleContext(View, SCOPE)` in src/ui/lib/alert-dialog/index.tsx).
 */
// The sheets and dialogs animate with reanimated, whose native worklets do not load under jest.
// reanimated 4.7's own mock still boots its native module (gate 36952107013), so a tiny stand-in:
// the dialog only needs createAnimatedComponent and chainable entering/exiting builders.
jest.mock('react-native-reanimated', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['duration', 'easing', 'delay', 'withInitialValues', 'springify']) chain[k] = () => chain;
  const createAnimatedComponent = (c: unknown) => c;
  return { __esModule: true, default: { createAnimatedComponent }, createAnimatedComponent, Easing: { linear: (t: number) => t }, FadeIn: chain, FadeOut: chain, ZoomIn: chain };
});

import { createElement } from 'react';
import { Platform, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { FullWindowOverlay } from 'react-native-screens';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { AlertDialog, AlertDialogBackdrop, AlertDialogContent } from '@/ui/lib/alert-dialog';

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(GluestackUIProvider, null, el)); });
  return r;
};

/** Is `node` inside a FullWindowOverlay? */
const lifted = (node: ReactTestInstance): boolean => {
  for (let p = node.parent; p; p = p.parent) if (p.type === FullWindowOverlay) return true;
  return false;
};
const textNode = (r: ReactTestRenderer, words: string): ReactTestInstance =>
  r.root.findAll((n) => n.type === Text && n.props['children'] === words)[0]!;

it('runs as iOS (jest-expo default) — the case the bug was on', () => {
  expect(Platform.OS).toBe('ios');
});

it('an open Actionsheet (the episode ⋯ sheet) draws inside the full-window overlay', () => {
  const r = render(createElement(Actionsheet, { isOpen: true, onClose: jest.fn() },
    createElement(ActionsheetBackdrop, null),
    createElement(ActionsheetContent, null, createElement(Text, null, 'Add to queue'))));
  expect(r.root.findAll((n) => n.type === FullWindowOverlay).length).toBeGreaterThanOrEqual(1);
  expect(lifted(textNode(r, 'Add to queue'))).toBe(true);
});

it('an open AlertDialog (the app\'s confirm) draws inside it too, so a confirm from a sheet is not hidden', () => {
  const r = render(createElement(AlertDialog, { isOpen: true, onClose: jest.fn() },
    createElement(AlertDialogBackdrop, null),
    createElement(AlertDialogContent, null, createElement(Text, null, 'Block Bea?'))));
  expect(lifted(textNode(r, 'Block Bea?'))).toBe(true);
});
