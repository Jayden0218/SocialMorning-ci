// Tests that "More account options" is its own page, so Back works right.
/**
 * M17 guard G-AM1 (phone walk 2026-10-02, M16a Tier B row "Settings → Account → More" FAILED:
 * both ← and the edge swipe skipped "Account and security" and landed on Settings).
 *
 * Cause: "More account options" was a sub-view toggled by `useState` inside
 * `app/settings/account.tsx`. The stack held one page where the listener saw two, so any back —
 * button or swipe — popped that one route. The fix makes More a real route
 * (`app/settings/account-more.tsx`) pushed on top of Account and security.
 *
 * Rendered: both pages. Pressing More must push `/settings/account-more` and leave Account and
 * security as it was (one title, no deletion flow); the More page carries the app's own bar and the
 * whole deletion flow. Which page is on the native stack, and what ← and the swipe then do, is a
 * navigator fact no renderer sees — the phone row is the real evidence.
 *
 * The break that turns it red: in app/settings/account.tsx change the More row's
 * `onPress={() => router.push('/settings/account-more')}` back to a sub-view toggle
 * (`onPress={() => setMore(true)}` with `const [more, setMore] = useState(false)`).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
const mockAuth = { requestCode: jest.fn(() => Promise.resolve({ resendAfterSeconds: 30 })), deleteAccountWithCode: jest.fn(() => Promise.resolve()) };
// One object per run, as the real context gives.
const mockSocial = { auth: mockAuth, listener: { listenerId: 'me', displayName: 'Ana', email: 'ana@example.com' } };
const mockStores = { settings: { get: () => undefined, set: () => undefined } };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));

import AccountSecurityScreen from '../app/settings/account';
import AccountMoreScreen from '../app/settings/account-more';

const APP = join(__dirname, '..', 'app');

// The busy buttons' Loader animates from timers; fake ones keep them inside each test.
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const rendered: ReactTestRenderer[] = [];
async function render(page: () => ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(page)); });
  rendered.push(r);
  return r;
}
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockPush.mockClear(); });

const headers = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header')
    .map((n) => n.children.filter((c): c is string => typeof c === 'string').join(''));
const labelled = (r: ReactTestRenderer, label: string): ReactTestInstance[] =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = async (r: ReactTestRenderer, label: string) => {
  const n = labelled(r, label)[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); });
  // Lets an awaited call's state updates settle.
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
};
const text = (r: ReactTestRenderer): string =>
  r.root.findAll((n) => typeof n.type === 'string').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string')).join(' ');

it('the More row pushes its own route', async () => {
  const r = await render(AccountSecurityScreen);
  expect(labelled(r, 'More account options')).not.toHaveLength(0);
  await press(r, 'More account options');
  expect(mockPush).toHaveBeenCalledWith('/settings/account-more');
});

it('Account and security keeps no sub-view: one fixed title, no deletion flow, before and after More', async () => {
  const r = await render(AccountSecurityScreen);
  expect(headers(r)).toEqual(['Account and security']);
  expect(labelled(r, 'Delete my account')).toHaveLength(0);
  await press(r, 'More account options');
  // A toggle would redraw this page as "More"; a pushed route leaves it untouched.
  expect(headers(r)).toEqual(['Account and security']);
  expect(labelled(r, 'Delete my account')).toHaveLength(0);
  expect(text(r)).not.toMatch(/Delete my account|Email me a code to confirm/);
});

it('the More page is a route with the app\'s own bar and the deletion flow', async () => {
  // Kept as a file fact: expo-router makes a route from a file in app/, so the file must exist.
  expect(existsSync(join(APP, 'settings', 'account-more.tsx'))).toBe(true);
  expect(typeof AccountMoreScreen).toBe('function');
  const r = await render(AccountMoreScreen);
  expect(headers(r)).toEqual(['More']);
  // The app's own back button (PageHeader → TopBar), never a native header.
  expect(labelled(r, 'Back')).not.toHaveLength(0);
  await press(r, 'Delete my account');
  expect(headers(r)).toEqual(['Delete my account']);
  await press(r, 'Email me a code to confirm');
  expect(mockAuth.requestCode).toHaveBeenCalledWith('ana@example.com');
  const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Code' && typeof n.props['onChangeText'] === 'function')[0]!;
  await act(async () => { field.props['onChangeText']('123456'); });
  await press(r, 'Delete account');
  expect(mockAuth.deleteAccountWithCode).toHaveBeenCalledWith('123456');
});
