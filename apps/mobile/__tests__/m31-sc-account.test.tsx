// Tests the Pulse sign-in, Terms-adjacent and onboarding pages: positions, sizes and the actions each keeps.
/**
 * M31 S-C (T061 + T062; design-pulse2 `settings.html` entries `auth-sign-in--*`, `auth-email--*`, `onboarding-*`, `terms--full-document`,
 * `pending-deletion--sheet`): the account pages read off the render — where the bars sit, how tall the buttons are, what each
 * step shows, and that every action the pages had still runs. (Terms, the rate sheet and Coming soon have their own files:
 * terms-sheet.test.tsx, m24-fixes-fp.test.tsx, coming-soon.test.ts.)
 *
 * Breaks that turn it red: `OverlayPage` — change `FOOT_TITLE_BOTTOM` (src/ui/kit/OverlayPage.tsx); sign-in — change `AUTH.zone.button`;
 * email — change `AUTH.cells.height`; the locked sheet — remove `locked` from `PendingDeletionSheet`; interests — change `AUTH.genre.height`;
 * "Not liking these?" — drop `disabled={!reason}` from the Send button.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockAuth = { requestCode: jest.fn(), signInWithCode: jest.fn(), signOut: jest.fn() };
const mockToast = jest.fn();
const mockMap = new Map<string, string>();
const mockSettings = { get: (k: string) => mockMap.get(k), set: (k: string, v: string) => { mockMap.set(k, v); } };
const mockDiscover = { setInterests: jest.fn().mockResolvedValue(undefined), skipInterests: jest.fn().mockResolvedValue(undefined), recFeedback: jest.fn().mockResolvedValue(undefined), interests: jest.fn() };
const mockM22 = { cancelDeletion: jest.fn().mockResolvedValue(undefined) };
let mockListener: unknown;
let mockParams: Record<string, string> = { agreed: '1' };

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => false },
  useLocalSearchParams: () => mockParams,
  Redirect: (p: { href: string }) => require('react').createElement('Redirect', { href: p.href }),
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: mockSettings }), useToast: () => mockToast, useCovered: () => false }));
jest.mock('@/social/context', () => ({ SUSPENDED_KEY: 'safety.suspendedMessage', useSocial: () => ({ auth: mockAuth, listener: mockListener }) }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => mockDiscover }));
jest.mock('@/social/api-m22-server', () => ({ ...(jest.requireActual('@/social/api-m22-server') as Record<string, unknown>), useM22Api: () => mockM22 }));
jest.mock('@/ui/auth/navigate', () => ({ toApp: jest.fn(), toSignIn: jest.fn() }));
jest.mock('@/ui/auth/ArtWall', () => ({ ArtWall: () => null, WallFade: () => null }));
jest.mock('@/notify/permission', () => ({ askForNotifications: () => Promise.resolve() }));
jest.mock('@/notify/expo', () => ({ expoNotify: {} }));
jest.mock('@/ui/shell/launch', () => ({ signInPage: { setWhole: () => undefined } }));
jest.mock('@/ui/lib/modal', () => {
  // The gluestack modal is a portal; a plain pass-through shows the document the sheet opened.
  const pass = (p: { children?: unknown; isOpen?: boolean }) => (p.isOpen === false ? null : (p.children ?? null));
  return { Modal: pass, ModalBackdrop: () => null, ModalContent: pass };
});

import { LEGAL_TEXT } from '@/legal/texts';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { OverlayPage } from '@/ui/kit/OverlayPage';
import { PendingDeletionSheet, KEEP_FLEX } from '@/ui/auth/PendingDeletion';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { LegalDoc } from '@/ui/shell/LegalDoc';
import { pendingDeletionStore } from '@/social/api-m22-server';
import { AGE_LINE, MIN_AGE, UNDER_AGE_TEXT } from '@/ui/auth/age';
import { READ_DELAY } from '@/ui/auth/Consent';
import { GENRES } from '@/discover/genres';
import SignInScreen from '../app/auth/sign-in';
import EmailScreen from '../app/auth/email';
import SignUpScreen from '../app/auth/sign-up';
import InterestsScreen from '../app/onboarding/interests';
import NotLikingScreen from '../app/onboarding/not-liking';

const INSETS = { top: 50, bottom: 34, left: 0, right: 0 };
const mounted: ReactTestRenderer[] = [];
const render = async (el: React.ReactElement, insets = INSETS): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: insets }, el)); });
  mounted.push(r);
  return r;
};
beforeAll(() => { setReducedMotionForTest(true); jest.useFakeTimers(); });
afterAll(() => { setReducedMotionForTest(undefined); jest.clearAllTimers(); jest.useRealTimers(); });
beforeEach(() => {
  mockMap.clear(); mockPush.mockClear(); mockReplace.mockClear(); mockBack.mockClear(); mockToast.mockClear();
  mockAuth.requestCode.mockReset().mockResolvedValue({ resendAfterSeconds: 0 });
  mockAuth.signInWithCode.mockReset().mockResolvedValue('needsName');
  mockAuth.signOut.mockReset().mockResolvedValue(undefined);
  mockDiscover.setInterests.mockClear(); mockDiscover.skipInterests.mockClear(); mockDiscover.recFeedback.mockClear().mockResolvedValue(undefined);
  mockM22.cancelDeletion.mockClear().mockResolvedValue(undefined);
  mockListener = undefined; mockParams = { agreed: '1' };
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });

const style = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const host = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string')[0]!;
const hosts = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string');
/** The outermost node with this label that takes a press. */
const tap = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
/** The outermost node with this label that has a state (a disabled pill has no press at all). */
/** The outermost node with this label that carries a style: the pill itself, not the kit button that names it. */
const styled = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityLabel'] === label && n.props['style'] !== undefined)[0]!;
const state = (r: ReactTestRenderer, label: string): Record<string, unknown> | undefined => r.root.findAll((n) => n.props['accessibilityLabel'] === label && n.props['accessibilityState'] !== undefined)[0]?.props['accessibilityState'];
const words = (n: ReactTestInstance): string => n.findAll((x) => typeof x.type === 'string').flatMap((x) => x.children.filter((c): c is string => typeof c === 'string')).join(' ');
/** The bottom of the title bar: the nearest ancestor of the title that sets `bottom`. */
const titleBottom = (r: ReactTestRenderer): number => { for (let p: ReactTestInstance | null = host(r, 'title-bar-title'); p; p = p.parent) { const b = style(p)['bottom']; if (typeof b === 'number') return b; } return NaN; };
const type = (r: ReactTestRenderer, label: string, text: string): void => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onChangeText'] === 'function')[0];
  if (!n) throw new Error(`no field "${label}"`);
  act(() => { n.props['onChangeText'](text); });
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = tap(r, label);
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); });
};

describe('OverlayPage: the title and the foot row sit where the drawing puts them', () => {
  const page = (p: Partial<Parameters<typeof OverlayPage>[0]> = {}): React.ReactElement => createElement(OverlayPage, { title: 'T', children: null, ...p });
  it('without a foot the title is 6 above the edge (40 on a drawn phone), with a foot 70 (104) and the row 6 (40)', async () => {
    const plain = await render(page({ inset: 34, onBack: () => undefined }));
    expect(titleBottom(plain)).toBe(40);
    const foot = await render(page({ inset: 34, onBack: () => undefined, foot: createElement('Foot') }));
    expect(titleBottom(foot)).toBe(104);
    expect(style(host(foot, 'overlay-foot'))).toMatchObject({ bottom: 40, left: 20, right: 20 });
    // A route page, whose root layout already pads the strip, passes none.
    const route = await render(page({ foot: createElement('Foot') }));
    expect(titleBottom(route)).toBe(70);
    expect(style(host(route, 'overlay-foot'))['bottom']).toBe(6);
  });
  it('draws a back circle only when it is given one', async () => {
    const none = await render(page());
    expect(tap(none, 'Back')).toBeUndefined();
    const onBack = jest.fn();
    const some = await render(page({ onBack, backLabel: 'Close', backIcon: 'close' }));
    await press(some, 'Close');
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('sign-in (auth-sign-in--screen, --consent-sheet, --legal-document)', () => {
  it('the bottom zone is 24 from the sides and 6 above the edge, 14 between its parts; the wordmark is 40; Continue with email is a 56 light pill', async () => {
    const r = await render(createElement(SignInScreen));
    expect(style(host(r, 'sign-in-zone'))).toMatchObject({ left: 24, right: 24, bottom: 6, gap: 14 });
    const mark = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header' && style(n)['fontSize'] === 40)[0]!;
    expect(words(mark)).toBe('SocialNet');
    const button = tap(r, 'Continue with email')!;
    expect(style(button)['height']).toBe(56);
    expect(String(button.props['className'])).toContain('bg-text');
    // No Google / Facebook until built (M25 L3c).
    expect(JSON.stringify(r.toJSON())).not.toMatch(/Google|Facebook/);
  });

  it('the consent box is 22 round 7 with a 1.5 rim; ticking it fills it hot and Continue goes straight on with agreed=1', async () => {
    const r = await render(createElement(SignInScreen));
    const box = () => host(r, 'tick-box');
    expect(style(box())).toMatchObject({ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5 });
    const label = 'I have read and agree to the Service Agreement and Privacy Policy';
    await press(r, label);
    expect(state(r, label)).toMatchObject({ checked: true });
    expect(String(box().props['className'])).toContain('bg-hot');
    await press(r, 'Continue with email');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/email', params: { agreed: '1' } });
  });

  it('Continue without the tick opens "Before you continue": Agree (52) ticks and goes on, Cancel closes it, a document row closes it and opens the text', async () => {
    const r = await render(createElement(SignInScreen));
    await press(r, 'Continue with email');
    expect(mockPush).not.toHaveBeenCalled();
    const sheet = () => r.root.findAll((n) => n.type === ActionSheet)[0]!;
    expect(sheet().props['open']).toBe(true);
    expect(sheet().props['label']).toBe('Before you continue');
    expect(style(styled(r, 'Agree and continue'))['height']).toBe(52);
    expect(words(sheet())).toContain('Please read and agree to these two documents.');
    // Cancel.
    await press(r, 'Cancel');
    expect(sheet().props['open']).toBe(false);
    // Again, and read a document: the sheet closes first, the text opens once it has gone.
    await press(r, 'Continue with email');
    await press(r, 'Privacy Policy');
    expect(sheet().props['open']).toBe(false);
    expect(words(r.root)).not.toContain('Do Not Track');
    await act(async () => { jest.advanceTimersByTime(READ_DELAY + 10); });
    expect(words(r.root)).toContain('Do Not Track');
    // Back from the document returns to sign-in with the tick unchanged (still unticked).
    await press(r, 'Back');
    expect(words(r.root)).not.toContain('Do Not Track');
    expect(state(r, 'I have read and agree to the Service Agreement and Privacy Policy')).toMatchObject({ checked: false });
    // Agree.
    await press(r, 'Continue with email');
    await press(r, 'Agree and continue');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/email', params: { agreed: '1' } });
  });

  it('the links in the sentence open the two documents', async () => {
    const r = await render(createElement(SignInScreen));
    const link = (name: string) => r.root.findAll((n) => n.props['accessibilityRole'] === 'link' && n.props['children'] === name && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { link('Service Agreement').props['onPress'](); });
    expect(words(r.root)).toContain('Scope of the Agreement');
  });
});

describe('the sign-up route', () => {
  it('still redirects to the email page', async () => {
    const r = await render(createElement(SignUpScreen));
    expect(r.root.findAll((n) => n.type === ('Redirect' as never))[0]!.props['href']).toBe('/auth/email');
  });
});

describe('email sign-in (auth-email--screen, --code-step, --name-step, --under-age, --suspended)', () => {
  it('step 1: the title low with a close circle, the 56 field, Send code a 52 pill that waits for an address', async () => {
    const r = await render(createElement(EmailScreen));
    // The root layout pads the home strip, so the title is 70 over the foot row's 52 + 12.
    expect(titleBottom(r)).toBe(70);
    expect(words(host(r, 'title-bar-title'))).toBe('Continue with email');
    expect(tap(r, 'Close')).toBeDefined();
    expect(style(host(r, 'auth-field'))).toMatchObject({ height: 56, borderRadius: 18 });
    expect(state(r, 'Send code')).toMatchObject({ disabled: true });
    expect(style(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Send code' && n.props['accessibilityState'] !== undefined)[0]!)['height']).toBe(52);
    type(r, 'Email', 'ana@example.com');
    expect(state(r, 'Send code')).toMatchObject({ disabled: false });
    // Consent was given on the landing page, so no box here.
    expect(hosts(r, 'tick-box')).toHaveLength(0);
  });

  it('opened without the landing page, the consent row is here and Send code asks first', async () => {
    mockParams = {};
    const r = await render(createElement(EmailScreen));
    expect(hosts(r, 'tick-box')).toHaveLength(1);
    type(r, 'Email', 'ana@example.com');
    await press(r, 'Send code');
    expect(mockAuth.requestCode).not.toHaveBeenCalled();
    await press(r, 'Agree and continue');
    expect(mockAuth.requestCode).toHaveBeenCalledWith('ana@example.com');
  });

  it('step 2: "Check your email" over the title, the address in a tile with Change, six 58 cells (the next one ringed in hot), Continue waits for six digits', async () => {
    const r = await render(createElement(EmailScreen));
    type(r, 'Email', 'ana@example.com');
    await press(r, 'Send code');
    expect(words(host(r, 'title-bar-title'))).toBe('Enter the code');
    expect(words(r.root)).toContain('Check your email');
    expect(words(r.root)).toContain('ana@example.com');
    const cells = r.root.findAll((n) => (n.props['testID'] === 'code-cell' || n.props['testID'] === 'code-cell-next') && typeof n.type === 'string');
    expect(cells).toHaveLength(6);
    expect(style(cells[0]!)).toMatchObject({ height: 58, borderRadius: 16, borderWidth: 1.5 });
    expect(hosts(r, 'code-cell-next')).toHaveLength(1);
    expect(state(r, 'Continue')).toMatchObject({ disabled: true });
    type(r, 'Code', '123');
    // Three digits typed: the fourth cell is the next one, three digits show.
    expect(words(r.root)).toContain('1 2 3');
    type(r, 'Code', '123456');
    expect(hosts(r, 'code-cell-next')).toHaveLength(0);
    expect(state(r, 'Continue')).toMatchObject({ disabled: false });
    // Change goes back a step.
    await press(r, 'Use a different email');
    expect(words(host(r, 'title-bar-title'))).toBe('Continue with email');
  });

  it('step 3: a 110 monogram with the typed initials, the name field, the age box; Create account waits for both; "I am under 14" shows the plain line', async () => {
    const r = await render(createElement(EmailScreen));
    type(r, 'Email', 'ana@example.com');
    await press(r, 'Send code');
    type(r, 'Code', '123456');
    await press(r, 'Continue');
    expect(words(host(r, 'title-bar-title'))).toBe('Your name');
    expect(words(r.root)).toContain('This is the name others see. You can use any name.');
    expect(style(host(r, 'name-monogram'))).toMatchObject({ width: 110, height: 110, borderRadius: 55 });
    type(r, 'Display name', 'rui tanaka');
    expect(words(host(r, 'name-monogram'))).toBe('RT');
    expect(state(r, 'Create account')).toMatchObject({ disabled: true });
    await press(r, AGE_LINE);
    expect(state(r, 'Create account')).toMatchObject({ disabled: false });
    expect(style(host(r, 'tick-box'))).toMatchObject({ width: 22 });
    await press(r, `I am under ${MIN_AGE}`);
    expect(state(r, 'Create account')).toMatchObject({ disabled: true });
    expect(words(host(r, 'under-age'))).toBe(UNDER_AGE_TEXT);
  });

  it('a suspended account: the refusal tile is ringed in hot and its Appeal pill (40) opens /appeal', async () => {
    mockMap.set('safety.suspendedMessage', 'This account is suspended until 3 Nov 2026 for repeated spam in comments.');
    const r = await render(createElement(EmailScreen));
    const tile = host(r, 'suspended-tile');
    expect(style(tile)).toMatchObject({ borderWidth: 1, borderRadius: 22, padding: 16 });
    expect(words(tile)).toContain('suspended until 3 Nov 2026');
    expect(style(styled(r, 'Appeal the suspension'))['height']).toBe(40);
    await press(r, 'Appeal the suspension');
    expect(mockPush).toHaveBeenCalledWith('/appeal');
  });

  it('the close circle leaves the page', async () => {
    const r = await render(createElement(EmailScreen));
    await press(r, 'Close');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

describe('Keep your account? (pending-deletion--sheet)', () => {
  const open = async (): Promise<ReactTestRenderer> => {
    mockListener = { listenerId: 'me' };
    pendingDeletionStore.set({ dueAt: '2026-11-11T00:00:00.000Z' });
    return render(createElement(PendingDeletionSheet));
  };
  afterEach(() => { act(() => { pendingDeletionStore.set(null); }); });

  it('is a locked kit sheet: no close, no backdrop tap; Keep my account takes 1.4 parts to Continue\'s 1', async () => {
    const r = await open();
    const sheet = r.root.findAll((n) => n.type === ActionSheet)[0]!;
    expect(sheet.props['open']).toBe(true);
    expect(sheet.props['locked']).toBe(true);
    expect(sheet.props['title']).toBeUndefined();
    expect(words(sheet)).toContain('Keep your account?');
    expect(words(sheet)).toContain('Until then nobody else can see it.');
    const flexOf = (label: string): unknown => { for (let p: ReactTestInstance | null = tap(r, label)!; p; p = p.parent) { const f = style(p)['flex']; if (typeof f === 'number') return f; } return undefined; };
    expect(flexOf('Keep my account')).toBe(KEEP_FLEX);
    expect(flexOf('Continue with the deletion')).toBe(1);
    // The scrim does nothing, and is hidden from a screen reader.
    const scrim = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close')[0]!;
    expect(scrim.props['onPress']).toBeUndefined();
  });

  it('Keep my account cancels the deletion and says so; a failure says it in hot-text and keeps the sheet; Continue signs out', async () => {
    const r = await open();
    mockM22.cancelDeletion.mockRejectedValueOnce(new Error('offline'));
    await press(r, 'Keep my account');
    expect(words(r.root)).toContain("Couldn't reach the server. Try again.");
    expect(mockToast).not.toHaveBeenCalled();
    await press(r, 'Keep my account');
    expect(mockToast).toHaveBeenCalledWith('Your account is staying. Everything is back.');
    expect(pendingDeletionStore.get()).toBeNull();
  });

  it('Continue signs out again and lets the deletion go ahead', async () => {
    const r = await open();
    await press(r, 'Continue with the deletion');
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(pendingDeletionStore.get()).toBeNull();
  });
});

describe('the legal document (terms--full-document)', () => {
  it('Back and a short title sit low (40 on a drawn phone); the eyebrow, the title and a Contents tile with 48 rows lead the text; Back closes', async () => {
    const onClose = jest.fn();
    const r = await render(createElement(LegalDoc, { text: LEGAL_TEXT.agreement, name: 'Service Agreement', onClose }));
    expect(titleBottom(r)).toBe(40);
    expect(words(host(r, 'title-bar-title'))).toBe('Service Agreement');
    expect(words(r.root)).toContain('SocialNet · legal');
    expect(words(r.root)).toContain('Contents');
    const rows = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && String(n.props['accessibilityLabel']).startsWith('Go to ') && typeof n.props['onPress'] === 'function');
    expect(rows.length).toBeGreaterThan(3);
    expect(style(rows[0]!)['minHeight']).toBe(48);
    await press(r, 'Back');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('onboarding (onboarding-interests--screen, --picked, onboarding-not-liking--screen)', () => {
  it('interests: two columns of 56 tiles 8 apart; the counter reads "Pick 2 more" then "2 picked"; Continue (52) waits for two and saves them', async () => {
    mockListener = { listenerId: 'me' };
    const r = await render(createElement(InterestsScreen));
    expect(words(host(r, 'title-bar-title'))).toBe('What do you like?');
    const tile = tap(r, GENRES[0]!.name)!;
    expect(style(tile)).toMatchObject({ height: 56, borderRadius: 18 });
    const second = tap(r, GENRES[1]!.name)!;
    expect(style(second)['width']).toBe(style(tile)['width']);
    expect(words(r.root)).toContain('Pick 2 more');
    expect(state(r, 'Continue with these categories')).toMatchObject({ disabled: true });
    expect(style(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Continue with these categories' && n.props['accessibilityState'] !== undefined)[0]!)['height']).toBe(52);
    await press(r, GENRES[0]!.name);
    expect(words(r.root)).toContain('Pick 1 more');
    await press(r, GENRES[1]!.name);
    expect(words(r.root)).toContain('2 picked');
    expect(state(r, GENRES[0]!.name)).toMatchObject({ selected: true });
    await press(r, 'Continue with these categories');
    expect(mockDiscover.setInterests).toHaveBeenCalledWith([GENRES[0]!.id, GENRES[1]!.id]);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('interests: Skip (the chip and the back circle) remembers the skip and leaves', async () => {
    mockListener = { listenerId: 'me' };
    const r = await render(createElement(InterestsScreen));
    await press(r, 'Skip choosing categories');
    expect(mockDiscover.skipInterests).toHaveBeenCalledTimes(1);
    expect(mockMap.get('interests.skippedAt')).toBeDefined();
    mockDiscover.skipInterests.mockClear();
    await press(r, 'Back');
    expect(mockDiscover.skipInterests).toHaveBeenCalledTimes(1);
  });

  it('not liking: four 76 reason tiles in a 2 × 2, the chosen one ringed in hot; the note box is always there; Send (52) waits for a reason, then posts it', async () => {
    mockMap.set('interests.genreIds', JSON.stringify([GENRES[0]!.id]));
    const r = await render(createElement(NotLikingScreen));
    expect(words(host(r, 'title-bar-title'))).toBe('Not liking these?');
    expect(words(r.root)).toContain('Your answer changes For You on its next refresh.');
    for (const l of ['Too familiar', 'Not my topics', 'Too long', 'Something else']) expect(style(tap(r, l)!)).toMatchObject({ height: 76, borderRadius: 22 });
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Tell us more' && typeof n.props['onChangeText'] === 'function').length).toBeGreaterThan(0);
    expect(state(r, "Send what's wrong with For You")).toMatchObject({ disabled: true });
    await press(r, 'Not my topics');
    expect(style(tap(r, 'Not my topics')!)).toMatchObject({ borderWidth: 1.5 });
    expect(style(tap(r, 'Too long')!)['borderWidth']).toBeUndefined();
    expect(state(r, 'Not my topics')).toMatchObject({ selected: true });
    type(r, 'Tell us more', 'too much news');
    // Categories are chips: add one, remove the pre-filled one.
    await press(r, GENRES[1]!.name);
    await press(r, GENRES[0]!.name);
    expect(state(r, "Send what's wrong with For You")).toMatchObject({ disabled: false });
    await press(r, "Send what's wrong with For You");
    expect(mockDiscover.recFeedback).toHaveBeenCalledWith({ reason: 'topics', note: 'too much news', add: [GENRES[1]!.id], remove: [GENRES[0]!.id] });
    expect(mockToast).toHaveBeenCalledWith('Thanks — For You will change on its next refresh.');
  });

  it('not liking: a failed send says so and keeps the page', async () => {
    mockDiscover.recFeedback.mockRejectedValueOnce(new Error('offline'));
    const r = await render(createElement(NotLikingScreen));
    await press(r, 'Too long');
    await press(r, "Send what's wrong with For You");
    expect(mockToast).toHaveBeenCalledWith("Couldn't send — try again when you're online.");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
