// Tests F14 (phase 1, red first): a toast raised while a sheet is open is seen ABOVE the sheet, not behind it.
/**
 * M31 F14 defect 1 (contact/wave-7/README.md "Real defects"; seen on toast--episode-sheet-body, comments--moment-like-toast,
 * toast--episode-extras). The kit's `ActionSheet` is a native `Modal`, which the phone draws above everything in the root view;
 * the toast host is mounted in AppProviders' root view (providers.tsx `<PlacedToastHost>`), so a toast raised from a sheet's row
 * was rendered but hidden behind the sheet's modal.
 *
 * The harness below is AppProviders' toast wiring and nothing else (providers.tsx: `message` state, `ToastContext.Provider value=show`,
 * `<PlacedToastHost message>` after the children), so the fix has to work through `ToastContext` / `ToastHost` / `ActionSheet`
 * alone. Requirement: with an `ActionSheet` open, `useContext(ToastContext)('x')` puts the toast pill (testID "toast") with the
 * text inside the sheet's Modal subtree. Break: remove whatever draws the toast in the modal - red.
 */
import { createElement, useCallback, useContext, useState } from 'react';
import { Modal } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ToastContext } from '@/ui/shell/toast-context';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { PlacedToastHost } from '@/ui/shell/toastPlacement';

jest.useFakeTimers();
jest.mock('expo-router', () => ({ usePathname: () => '/episode/e1', router: { push: jest.fn() } }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: () => false }));
jest.mock('@/ui/player/MiniPlayer', () => ({ TAB_ROUTES: ['/', '/library'], miniPlayerShows: () => false }));
jest.mock('@/ui/player/nowbar-signals', () => ({ useNowBarSignals: () => ({ moments: false }) }));

let raise!: (m: string) => void;
const setRaise = (f: (m: string) => void): void => { raise = f; };
function Raiser(): null { setRaise(useContext(ToastContext)!); return null; }
function Harness(props: { sheet: boolean }): React.ReactElement {
  const [message, setMessage] = useState<string | undefined>(undefined);
  const show = useCallback((m: string) => setMessage(m), []);
  return createElement(ToastContext.Provider, { value: show },
    createElement(Raiser),
    createElement(ActionSheet, { open: props.sheet, onClose: jest.fn(), label: 'Episode options' }, createElement('Text', null, 'row')),
    createElement(PlacedToastHost, { message }),
  );
}

let r: ReactTestRenderer;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => r?.unmount()); setReducedMotionForTest(undefined); });
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const toasts = (): ReactTestInstance[] => r.root.findAll((n) => n.props['testID'] === 'toast' && typeof n.type === 'string' && say(n.props['children']).includes('x'));
const inModal = (n: ReactTestInstance): boolean => { for (let p = n.parent; p; p = p.parent) if (p.type === Modal || String(p.type) === 'Modal') return true; return false; };

it('sheet open + toast: the toast pill is drawn inside the sheet\'s Modal (so it is above it)', () => {
  act(() => { r = create(createElement(Harness, { sheet: true })); });
  const sheet = r.root.findAll((n) => n.props['testID'] === 'action-sheet' && typeof n.type !== 'string')[0] ?? r.root.findAll((n) => n.props['testID'] === 'action-sheet')[0]!;
  expect(inModal(sheet)).toBe(true); // the helper sees the sheet's Modal
  act(() => { raise('x'); });
  const all = toasts();
  expect(all.length).toBeGreaterThan(0);
  expect(all.some(inModal)).toBe(true);
});

it('no sheet open + toast: still drawn (once, in the root host)', () => {
  act(() => { r = create(createElement(Harness, { sheet: false })); });
  act(() => { raise('x'); });
  expect(toasts().length).toBeGreaterThan(0);
});
